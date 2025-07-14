const fullCatalog = [];
let ataPricing = {};
let selectedRow = null;
let lastVmData = [];
let matchedSkus = [];
const preferredSeries = ['Dsv5', 'Dasv5', 'Esv5'];
const defaultAzureStoragePricePerGB = 0.3;
let azureStoragePricing = [];
let azureVMPricing = [];
let storageUnit = 'GB';
let workbook = null;

// Debounce utility
function debounce(fn, ms) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

// Escape CSV values
function escapeCsvValue(value) {
  if (typeof value !== 'string') return value;
  return `"${value.replace(/"/g, '""')}"`;
}

// Load Azure VM catalog and pricing from JSON
async function loadAzureDataFromJson() {
  try {
    const res = await fetch('./az_data-export.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load Azure data`);
    const data = await res.json();
    console.log('Data from az_data-export.json:', data); // Debug
    const azureData = data.Items || data; // Access Items or root array
    if (!Array.isArray(azureData)) {
      throw new Error(`Expected an array, got ${typeof azureData}`);
    }
    // Map data for fullCatalog
    fullCatalog.length = 0;
    fullCatalog.push(...azureData.map(item => ({
      name: item.armSkuName || '',
      cpu: parseInt(item.meterName?.match(/\d+/)?.[0]) || 0,
      ram: parseInt(item.productName?.match(/\d+/)?.[0]) || 0,
      storage: 0, // Not provided in JSON, default to 0
      priceLinux: item.productName?.includes('Windows') ? 0 : parseFloat(item.retailPrice) * 730,
      priceWindows: item.productName?.includes('Windows') ? parseFloat(item.retailPrice) * 730 : 0
    })));
    // Map data for azureVMPricing
    azureVMPricing = azureData.map(item => ({
      name: item.armSkuName || '',
      cpu: parseInt(item.meterName?.match(/\d+/)?.[0]) || 0,
      ram: parseInt(item.productName?.match(/\d+/)?.[0]) || 0,
      storage: 0, // Not provided in JSON, default to 0
      priceLinux: item.productName?.includes('Windows') ? 0 : parseFloat(item.retailPrice) * 730,
      priceWindows: item.productName?.includes('Windows') ? parseFloat(item.retailPrice) * 730 : 0
    }));
    // Merge specs from catalog (retained for compatibility)
    fullCatalog.forEach(catalogItem => {
      const apiItem = azureVMPricing.find(api => api.name === catalogItem.name);
      if (apiItem) {
        apiItem.cpu = catalogItem.cpu;
        apiItem.ram = catalogItem.ram;
        apiItem.storage = catalogItem.storage;
      }
    });
  } catch (err) {
    console.error('Azure data load error:', err);
    alert(`Failed to load Azure data: ${err.message}`);
    fullCatalog.length = 0;
    azureVMPricing = [];
  }
}

// Load Azure storage pricing from local JSON
async function loadAzureStoragePricingFromJson() {
  try {
    const response = await fetch('./az_storage-pricing.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load Azure storage pricing`);
    const data = await response.json();
    azureStoragePricing = data.Items.map(item => ({
      skuName: item.skuName,
      retailPrice: parseFloat(item.retailPrice),
      unitOfMeasure: item.unitOfMeasure,
      diskSizeGB: parseInt(item.skuName?.match(/\d+/)?.[0]) || 0,
      diskType: item.productName?.includes('Premium SSD') ? 'Premium SSD' : 'Standard SSD'
    }));
    // Disk size mapping
    azureStoragePricing.forEach(item => {
      const sizeMap = {
        'E1': 4, 'E2': 8, 'E3': 16, 'E4': 32, 'E6': 64, 'E10': 128, 'E15': 256, 'E20': 512,
        'E30': 1024, 'E40': 2048, 'E50': 4096, 'E60': 8192, 'E70': 16384, 'E80': 32767,
        'P4': 32, 'P6': 64, 'P10': 128, 'P15': 256, 'P20': 512, 'P30': 1024, 'P40': 2048,
        'P50': 4096, 'P60': 8192, 'P70': 16384, 'P80': 32767
      };
      item.diskSizeGB = sizeMap[item.skuName] || item.diskSizeGB;
    });
  } catch (err) {
    console.error('Azure storage pricing load error:', err);
    azureStoragePricing = [];
  }
}

// Load private cloud pricing
async function loadPrivateCloudPricing() {
  try {
    const res = await fetch('./cld-pricing.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load private cloud pricing`);
    const data = await res.json();
    ataPricing = data;
    populatePricingEditor();
    updateSummary();
  } catch (err) {
    console.error('Private cloud pricing load error:', err);
    alert(`Failed to load private cloud pricing: ${err.message}`);
  }
}

// Initialize on window load
window.onload = async () => {
  await loadAzureDataFromJson();
  await loadAzureStoragePricingFromJson();
  await loadPrivateCloudPricing();

  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', event => {
      if (event.target.files.length) {
        readXlsx(event.target.files[0]);
      }
    });
  }

  document.getElementById('filterName')?.addEventListener('input', debounce(filterSKUs, 300));
  document.getElementById('filterCPU')?.addEventListener('input', debounce(filterSKUs, 300));
  document.getElementById('filterRAM')?.addEventListener('input', debounce(filterSKUs, 300));

  document.getElementById('darkModeToggle')?.addEventListener('click', toggleDarkMode);

  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
  }

  document.getElementById('downloadCsv')?.addEventListener('click', downloadCsv);

  document.getElementById('batchSqlAssign')?.addEventListener('click', () => {
    const tag = prompt('Enter SQL License Tag for selected VMs (SQL-Std or SQL-Ent):');
    if (tag === 'SQL-Std' || tag === 'SQL-Ent') {
      lastVmData.forEach((vm, i) => {
        if (vm.selected) {
          vm.sqlLicensed = true;
          vm.sqlLicenseType = tag;
        }
      });
      renderVMTable(lastVmData);
      updateSummary();
    } else {
      alert('Invalid tag. Use SQL-Std or SQL-Ent.');
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.forEach(tooltipTriggerEl => {
      new bootstrap.Tooltip(tooltipTriggerEl);
    });
  });
};

// Toggle dark mode
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

// Download combined CSV (legacy)
function downloadCsv() {
  const rows = [['VM Name', 'CPU', 'RAM', 'Storage', 'OS', 'SKU', 'Disk Type', 'Azure Cost (A$)', 'Azure VM Cost (A$)', 'Azure Storage Cost (A$)', 'Private Cloud Cost (A$)', 'Tag']];
  lastVmData.forEach((vm, i) => {
    const azureCostBreakdown = calculateAzureVMPrice(i);
    rows.push([
      escapeCsvValue(vm['Display Name'] || vm['VM'] || 'Unnamed'),
      vm['Num CPU'] || vm['CPUs'] || '',
      vm['Memory'] || '',
      `${vm['Provisioned Storage (GB)'] || ''} ${storageUnit}`,
      (vm['OS'] || vm['Guest OS'] || '').includes('Windows') ? 'Windows' : 'Linux',
      escapeCsvValue(matchedSkus[i]?.name || 'No Match'),
      vm.diskType || 'Standard SSD',
      `A$${azureCostBreakdown.total.toFixed(2)}`,
      `A$${azureCostBreakdown.base.toFixed(2)}`,
      `A$${azureCostBreakdown.storage.toFixed(2)}`,
      `A$${calculatePrivateCloudPrice(i).toFixed(2)}`,
      escapeCsvValue(vm.sqlLicenseType || '')
    ]);
  });
  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
  const link = document.createElement('a');
  link.setAttribute('href', encodeURI(csvContent));
  link.setAttribute('download', 'vm_cost_summary.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export CSV for Azure or Private Cloud
function exportCSV(type) {
  const headers = ['VM Name', 'CPU', 'RAM', 'Storage', 'OS', 'SKU', 'Disk Type', type === 'azure' ? 'Azure Cost (A$)' : 'Private Cloud Cost (A$)', 'Tag'];
  const rows = [headers];
  lastVmData.forEach((vm, i) => {
    const azureCostBreakdown = calculateAzureVMPrice(i);
    const privatePrice = calculatePrivateCloudPrice(i);
    rows.push([
      escapeCsvValue(vm['Display Name'] || vm['VM'] || 'Unnamed'),
      vm['Num CPU'] || vm['CPUs'] || '',
      vm['Memory'] || '',
      `${vm['Provisioned Storage (GB)'] || ''} ${storageUnit}`,
      (vm['OS'] || vm['Guest OS'] || '').includes('Windows') ? 'Windows' : 'Linux',
      escapeCsvValue(matchedSkus[i]?.name || 'No Match'),
      vm.diskType || 'Standard SSD',
      type === 'azure' ? `A$${azureCostBreakdown.total.toFixed(2)}` : `A$${privatePrice.toFixed(2)}`,
      escapeCsvValue(vm.sqlLicenseType || '')
    ]);
  });
  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
  const link = document.createElement('a');
  link.setAttribute('href', encodeURI(csvContent));
  link.setAttribute('download', `vm_cost_${type}_summary.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// XLSX reading
function readXlsx(file) {
  const spinner = document.getElementById('spinner');
  spinner.style.display = 'block';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      workbook = XLSX.read(data, { type: 'array' });
      const sheetPicker = document.getElementById('sheetPickerContainer');
      const sheetSelect = document.getElementById('sheetSelect');
      if (workbook.SheetNames.length > 1) {
        sheetSelect.innerHTML = workbook.SheetNames.map(name => `<option value="${name}">${name}</option>`).join('');
        sheetPicker.style.display = 'block';
        spinner.style.display = 'none';
      } else {
        loadSheet(workbook.SheetNames[0]);
      }
    } catch (err) {
      spinner.style.display = 'none';
      alert(`XLSX parsing failed: ${err.message}. Please ensure the file is a valid RVTools export.`);
    }
  };
  reader.onerror = () => {
    spinner.style.display = 'none';
    alert('Failed to read the file. Please try again.');
  };
  reader.readAsArrayBuffer(file);
}

// Load selected sheet
function loadSelectedSheet() {
  const sheetSelect = document.getElementById('sheetSelect');
  const sheetName = sheetSelect.value;
  loadSheet(sheetName);
  document.getElementById('sheetPickerContainer').style.display = 'none';
}

// Load specific sheet
function loadSheet(sheetName) {
  const spinner = document.getElementById('spinner');
  spinner.style.display = 'block';
  try {
    const sheet = workbook.Sheets[sheetName];
    const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || [];
    const storageHeader = headers.find(h => h && h.toString().toLowerCase().includes('provisioned storage'));
    if (storageHeader) {
      const headerLower = storageHeader.toLowerCase();
      if (headerLower.includes('(gib)')) storageUnit = 'GiB';
      else if (headerLower.includes('(gb)')) storageUnit = 'GB';
      else if (headerLower.includes('(mib)')) storageUnit = 'MiB';
      else if (headerLower.includes('(mb)')) storageUnit = 'MB';
      else storageUnit = 'GB';
    } else {
      storageUnit = 'GB';
    }

    const vmData = XLSX.utils.sheet_to_json(sheet);
    spinner.style.display = 'none';
    if (!vmData.length) {
      alert('No data found in the uploaded file');
      return;
    }
    lastVmData = vmData.map(vm => ({ ...vm, selected: false, diskType: 'Standard SSD' }));
    renderVMTable(lastVmData);
    updateSummary();
  } catch (err) {
    spinner.style.display = 'none';
    alert(`Sheet loading failed: ${err.message}. Please ensure the file is a valid RVTools export.`);
  }
}

// Storage unit conversions
function convertToGiB(storage, unit) {
  switch (unit) {
    case 'GiB':
      return storage;
    case 'GB':
      return storage;
    case 'MiB':
      return storage / 1024;
    case 'MB':
      return storage / 1024;
    default:
      return storage;
  }
}

function calculateAzureStorageCost(storage, skuStorageMB, diskType = 'Standard SSD') {
  const storageGiB = convertToGiB(parseFloat(storage) || 0, storageUnit);
  const skuStorageGiB = skuStorageMB / 1024;
  const additionalStorageGiB = Math.max(0, storageGiB - skuStorageGiB);
  if (additionalStorageGiB <= 0) return 0;
  const disk = azureStoragePricing
    .filter(d => d.diskSizeGB >= additionalStorageGiB && d.diskType === diskType)
    .sort((a, b) => a.diskSizeGB - b.diskSizeGB)[0];

  if (!disk) {
    return diskType === 'Standard SSD' ? additionalStorageGiB * defaultAzureStoragePricePerGB : 0;
  }
  return disk.retailPrice;
}

function calculateAzureVMPrice(index) {
  const vm = lastVmData[index];
  const sku = matchedSkus[index] || vm.manualSku;
  const storage = parseFloat(vm['Provisioned Storage (GB)'] || 0);
  const diskType = vm.diskType || 'Standard SSD';
  if (!sku) return { total: 0, base: 0, storage: 0, sql: 0 };

  let basePrice = 0;
  const apiSku = azureVMPricing.find(s => s.name === sku.name);
  basePrice = apiSku ? (sku.priceWindows > 0 ? apiSku.priceWindows : apiSku.priceLinux) : 0;

  const sqlCost = vm.sqlLicensed ? calculateSqlLicenseCost(vm['CPUs'], vm.sqlLicenseType) : 0;
  const storageCost = calculateAzureStorageCost(storage, sku.storage, diskType);
  const total = basePrice + storageCost + sqlCost;

  return { total, base: basePrice, storage: storageCost, sql: sqlCost };
}

function calculatePrivateCloudPrice(index) {
  const vm = lastVmData[index];
  const cpu = parseInt(vm['CPUs']) || 0;
  const ram = parseFloat(vm['Memory']) || 0;
  const storage = parseFloat(vm['Provisioned Storage (GB)'] || 0);
  const os = (vm['OS'] || '').toLowerCase();
  const octopus = os.includes('win') ? (ataPricing.octopus || 0) : 0;
  const sql = vm.sqlLicensed ? calculateSqlLicenseCost(cpu, vm.sqlLicenseType) : 0;
  return (cpu * (ataPricing.cpu || 0)) + (ram * (ataPricing.ram || 0)) + (storage * (ataPricing.storage || 0)) + (ataPricing.base || 0) + octopus + sql;
}

function calculateSqlLicenseCost(cpuCount, type = 'SQL-Std') {
  const coreCount = Math.max(4, Math.ceil(parseInt(cpuCount) / 2) * 2);
  const unitPrice = ataPricing[type] || 0;
  return (coreCount / 2) * unitPrice;
}

function updateSummary() {
  const azureTotal = lastVmData.reduce((sum, _, i) => sum + calculateAzureVMPrice(i).total, 0);
  const privateTotal = lastVmData.reduce((sum, _, i) => sum + calculatePrivateCloudPrice(i), 0);
  document.getElementById('totalPrice').innerText = `A$${azureTotal.toFixed(2)}`;
  document.getElementById('ataPrice').innerText = `A$${privateTotal.toFixed(2)}`;
}

function populatePricingEditor() {
  const editor = document.getElementById('pricingEditor');
  if (!editor) return;
  editor.innerHTML = '';
  const entries = ['base', 'cpu', 'ram', 'storage', 'octopus', 'SQL-Std', 'SQL-Ent'];
  entries.forEach(key => {
    const div = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = `${key}: `;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.min = '0';
    input.value = ataPricing[key] || 0;
    input.addEventListener('change', () => {
      const value = parseFloat(input.value);
      if (isNaN(value) || value < 0) {
        alert(`Invalid value for ${key}. Please enter a non-negative number.`);
        input.value = ataPricing[key] || 0;
        return;
      }
      ataPricing[key] = value;
      renderVMTable(lastVmData);
      updateSummary();
    });
    div.appendChild(label);
    div.appendChild(input);
    editor.appendChild(div);
  });
}

function filterSKUs() {
  const name = document.getElementById('filterName')?.value.toLowerCase() || '';
  const cpu = document.getElementById('filterCPU')?.value || '';
  const ram = document.getElementById('filterRAM')?.value || '';
  const filtered = azureVMPricing.filter(sku => {
    return (
      (!name || sku.name.toLowerCase().includes(name)) &&
      (!cpu || sku.cpu.toString().includes(cpu)) &&
      (!ram || sku.ram.toString().includes(ram))
    );
  });
  const tbody = document.getElementById('skuTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  filtered.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.cpu}</td>
      <td>${(s.ram / 1024).toFixed(1)} GB</td>
      <td>${(s.storage / 1024).toFixed(1)} GB</td>
      <td>A$${s.priceLinux.toFixed(2)}</td>
      <td><button class="btn btn-sm btn-success" onclick="selectSkuByName('${s.name.replace(/'/g, '')}')">✔</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function openSkuPopup(index) {
  selectedRow = index;
  const vm = lastVmData[index];
  const vmName = vm['Display Name'] || vm['VM'] || 'Unnamed';
  const cpu = parseInt(vm['Num CPU'] || vm['CPUs'] || 0);
  const ram = parseFloat(vm['Memory'] || 0);
  const modalTitle = document.querySelector('#skuModal .modal-title');
  if (modalTitle) {
    modalTitle.textContent = `Select a Matching SKU (VM: ${vmName}, CPU: ${cpu}, RAM: ${ram.toFixed(1)} GB)`;
  }
  filterSKUs();
  new bootstrap.Modal(document.getElementById('skuModal')).show();
}

function selectSkuByName(name) {
  const selectedSku = azureVMPricing.find(s => s.name === name);
  if (selectedSku && selectedRow !== null) {
    matchedSkus[selectedRow] = selectedSku;
    lastVmData[selectedRow].manualSku = selectedSku;
    renderVMTable(lastVmData);
    updateSummary();
    bootstrap.Modal.getInstance(document.getElementById('skuModal')).hide();
  }
}

function assignSQLTag(index) {
  const tag = prompt('Enter SQL License Tag (SQL-Std or SQL-Ent):')?.trim();
  if (tag === 'SQL-Std' || tag === 'SQL-Ent') {
    lastVmData[index].sqlLicensed = true;
    lastVmData[index].sqlLicenseType = tag;
    renderVMTable(lastVmData);
    updateSummary();
  } else {
    alert('Invalid tag. Use SQL-Std or SQL-Ent.');
  }
}

function clearSQLTag(index) {
  lastVmData[index].sqlLicensed = false;
  lastVmData[index].sqlLicenseType = null;
  renderVMTable(lastVmData);
  updateSummary();
}

function renderVMTable(vmData) {
  if (!vmData || !vmData.length) return;
  const tbody = document.querySelector('#vmTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  vmData.forEach((vm, index) => {
    const cpu = parseInt(vm['Num CPU'] || vm['CPUs'] || 0);
    const ram = parseFloat(vm['Memory'] || 0);
    const storage = parseFloat(vm['Provisioned Storage (GB)'] || 0);
    const os = (vm['OS'] || vm['Guest OS'] || '').includes('Windows') ? 'Windows' : 'Linux';
    const skuMatch = vm.manualSku || getPreferredSku(
      azureVMPricing.filter(s => s.cpu >= cpu && s.ram >= ram * 1024),
      cpu,
      ram * 1024
    );
    matchedSkus[index] = skuMatch;
    const azureCostBreakdown = calculateAzureVMPrice(index);
    const privatePrice = calculatePrivateCloudPrice(index);

    const sku = matchedSkus[index] || vm.manualSku;
    const azureTooltip = sku
      ? `Base VM: A$${azureCostBreakdown.base.toFixed(2)}\n` +
        `Storage (${vm.diskType || 'Standard SSD'}): A$${azureCostBreakdown.storage.toFixed(2)} (${storage} ${storageUnit})\n` +
        `${azureCostBreakdown.sql ? `SQL License (${vm.sqlLicenseType}): A$${azureCostBreakdown.sql.toFixed(2)}\n` : ''}` +
        `Total: A$${azureCostBreakdown.total.toFixed(2)}`
      : 'No SKU selected';

    const cpuCost = cpu * (ataPricing.cpu || 0);
    const ramCost = ram * (ataPricing.ram || 0);
    const storageCost = storage * (ataPricing.storage || 0);
    const baseCost = ataPricing.base || 0;
    const octopusCost = os.includes('Windows') ? (ataPricing.octopus || 0) : 0;
    const sqlCost = vm.sqlLicensed ? calculateSqlLicenseCost(vm['CPUs'], vm.sqlLicenseType) : 0;
    const privateTooltip = `CPU: A$${cpuCost.toFixed(2)} (${cpu} × A$${(ataPricing.cpu || 0).toFixed(2)})\n` +
                          `RAM: A$${ramCost.toFixed(2)} (${ram} GB × A$${(ataPricing.ram || 0).toFixed(2)})\n` +
                          `Storage: A$${storageCost.toFixed(2)} (${storage} ${storageUnit} × A$${(ataPricing.storage || 0).toFixed(2)})\n` +
                          `Base Fee: A$${baseCost.toFixed(2)}\n` +
                          `Octopus Fee: A$${octopusCost.toFixed(2)}\n` +
                          `${sqlCost ? `SQL License (${vm.sqlLicenseType}): A$${sqlCost.toFixed(2)}\n` : ''}` +
                          `Total: A$${privatePrice.toFixed(2)}`;

    const tr = document.createElement('tr');
    tr.title = `Azure: A$${azureCostBreakdown.total.toFixed(2)}\nPrivate: A$${privatePrice.toFixed(2)}`;
    if (!skuMatch) tr.classList.add('table-danger');

    const tdName = document.createElement('td');
    tdName.textContent = vm['Display Name'] || vm['VM'] || 'Unnamed';
    tr.appendChild(tdName);

    const tdCpu = document.createElement('td');
    tdCpu.textContent = cpu;
    tr.appendChild(tdCpu);

    const tdRam = document.createElement('td');
    tdRam.textContent = `${ram.toFixed(1)} GB`;
    tr.appendChild(tdRam);

    const tdStorage = document.createElement('td');
    tdStorage.textContent = `${storage} ${storageUnit}`;
    tr.appendChild(tdStorage);

    const tdOs = document.createElement('td');
    tdOs.textContent = os;
    tr.appendChild(tdOs);

    const tdSku = document.createElement('td');
    tdSku.textContent = skuMatch ? skuMatch.name : 'No Match';
    if (!skuMatch) {
      const em = document.createElement('em');
      em.textContent = 'No Match';
      tdSku.textContent = '';
      tdSku.appendChild(em);
    }
    const adjBtn = document.createElement('button');
    adjBtn.className = 'btn btn-sm btn-warning ms-2';
    adjBtn.textContent = 'Adj';
    adjBtn.onclick = () => openSkuPopup(index);
    tdSku.appendChild(adjBtn);
    tr.appendChild(tdSku);

    const tdDiskType = document.createElement('td');
    const diskSelect = document.createElement('select');
    diskSelect.className = 'form-select form-select-sm';
    diskSelect.innerHTML = `
      <option value="Standard SSD" ${vm.diskType === 'Standard SSD' ? 'selected' : ''}>Standard SSD</option>
      <option value="Premium SSD" ${vm.diskType === 'Premium SSD' ? 'selected' : ''}>Premium SSD</option>
    `;
    diskSelect.onchange = (e) => {
      vm.diskType = e.target.value;
      renderVMTable(lastVmData);
      updateSummary();
    };
    tdDiskType.appendChild(diskSelect);
    tr.appendChild(tdDiskType);

    const tdAzure = document.createElement('td');
    tdAzure.textContent = `A$${azureCostBreakdown.total.toFixed(2)}`;
    tdAzure.setAttribute('data-bs-toggle', 'tooltip');
    tdAzure.setAttribute('data-bs-placement', 'top');
    tdAzure.setAttribute('title', azureTooltip);
    tr.appendChild(tdAzure);

    const tdPrivate = document.createElement('td');
    tdPrivate.textContent = `A$${privatePrice.toFixed(2)}`;
    tdPrivate.setAttribute('data-bs-toggle', 'tooltip');
    tdPrivate.setAttribute('data-bs-placement', 'top');
    tdPrivate.setAttribute('title', privateTooltip);
    tr.appendChild(tdPrivate);

    const tdTag = document.createElement('td');
    if (vm.sqlLicenseType) {
      const span = document.createElement('span');
      span.className = 'badge bg-success';
      span.textContent = vm.sqlLicenseType;
      const close = document.createElement('span');
      close.style.cursor = 'pointer';
      close.textContent = ' ×';
      close.onclick = () => clearSQLTag(index);
      span.appendChild(close);
      tdTag.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-outline-primary';
      btn.textContent = '+';
      btn.onclick = () => assignSQLTag(index);
      tdTag.appendChild(btn);
    }
    tr.appendChild(tdTag);

    tbody.appendChild(tr);
  });

  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach(tooltipTriggerEl => {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });
}

function getPreferredSku(skus, cpu, ram) {
  const preferred = skus.filter(sku => preferredSeries.some(series => sku.name.includes(series)))
    .sort((a, b) => (a.cpu - cpu) || (a.ram - ram) || (a.priceLinux - b.priceLinux));
  return preferred[0] || skus.sort((a, b) => (a.cpu - cpu) || (a.ram - ram) || (a.priceLinux - b.priceLinux))[0];
}
