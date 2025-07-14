// RVTools Matcher - Improved JavaScript Logic

// Global state
const fullCatalog = [];
let ataPricing = {};
let selectedRow = null;
let lastVmData = [];
let matchedSkus = [];
const octopusFeePerWindowsVM = 20;
const preferredSeries = ['Dsv5', 'Dasv5', 'Esv5'];

// Utility: Debounce function to limit rapid event triggers
function debounce(fn, ms) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

// Utility: Escape CSV values to prevent injection
function escapeCsvValue(value) {
  if (typeof value !== 'string') return value;
  return `"${value.replace(/"/g, '""')}"`;
}

// Load Azure and Private pricing catalogs
fetch('./az_data-export.json')
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load Azure catalog`);
    return res.json();
  })
  .then(data => {
    fullCatalog.push(...data.map(item => ({
      name: item.name || '',
      cpu: parseInt(item.numberOfCores) || 0,
      ram: parseInt(item.memoryInMB) || 0,
      storage: parseInt(item.osDiskSizeInMB) || 0,
      priceLinux: parseFloat(item.linuxPrice) || 0,
      priceWindows: parseFloat(item.windowsPrice) || 0
    })));
  })
  .catch(err => {
    console.error('Azure catalog load error:', err);
    alert(`Failed to load Azure catalog: ${err.message}`);
  });

fetch('./cld-pricing.json')
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load private cloud pricing`);
    return res.json();
  })
  .then(data => {
    ataPricing = data;
    populatePricingEditor();
    updateSummary();
  })
  .catch(err => {
    console.error('Private cloud pricing load error:', err);
    alert(`Failed to load private cloud pricing: ${err.message}`);
  });

// Initialize event listeners
window.onload = () => {
  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', event => {
      if (event.target.files.length) {
        readXlsx(event.target.files[0]);
      }
    });
  }

  // Debounced SKU filtering
  document.getElementById('filterName')?.addEventListener('input', debounce(filterSKUs, 300));
  document.getElementById('filterCPU')?.addEventListener('input', debounce(filterSKUs, 300));
  document.getElementById('filterRAM')?.addEventListener('input', debounce(filterSKUs, 300));

  // Dark mode toggle
  document.getElementById('darkModeToggle')?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('darkMode', document.body.classList.contains('dark'));
  });

  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark');
  }

  // CSV download
  document.getElementById('downloadCsv')?.addEventListener('click', () => {
    const rows = [['VM Name', 'CPU', 'RAM', 'Storage', 'OS', 'SKU', 'Azure Cost', 'Private Cloud Cost', 'SQL']];
    lastVmData.forEach((vm, i) => {
      rows.push([
        escapeCsvValue(vm['Display Name'] || vm['VM'] || 'Unnamed'),
        vm['Num CPU'] || vm['CPUs'] || '',
        vm['Memory'] || '',
        vm['Provisioned Storage (GB)'] || '',
        (vm['OS'] || vm['Guest OS'] || '').includes('Windows') ? 'Windows' : 'Linux',
        escapeCsvValue(matchedSkus[i]?.name || 'No Match'),
        `$${calculateAzureVMPrice(i).toFixed(2)}`,
        `$${calculatePrivateCloudPrice(i).toFixed(2)}`,
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
  });

  // Batch SQL license assignment
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

  // Initialize Bootstrap tooltips
  document.addEventListener('DOMContentLoaded', () => {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.forEach(tooltipTriggerEl => {
      new bootstrap.Tooltip(tooltipTriggerEl);
    });
  });
};

// Read and parse XLSX file
function readXlsx(file) {
  const spinner = document.getElementById('spinner');
  spinner.style.display = 'block';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const sheetName = wb.SheetNames.includes('vInfo') ? 'vInfo' : wb.SheetNames[0];
      const vmData = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
      spinner.style.display = 'none';
      if (!vmData.length) {
        alert('No data found in the uploaded file');
        return;
      }
      lastVmData = vmData.map(vm => ({ ...vm, selected: false }));
      renderVMTable(lastVmData);
      updateSummary();
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

// Calculate Azure VM price
function calculateAzureVMPrice(index) {
  const sku = matchedSkus[index] || lastVmData[index].manualSku;
  const os = (lastVmData[index]['OS'] || '').includes('Windows') ? 'Windows' : 'Linux';
  if (!sku) return 0;
  const sql = lastVmData[index].sqlLicensed ? calculateSqlLicenseCost(lastVmData[index]['CPUs'], lastVmData[index].sqlLicenseType) : 0;
  return (os === 'Windows' ? sku.priceWindows : sku.priceLinux) + sql;
}

// Calculate private cloud price
function calculatePrivateCloudPrice(index) {
  const vm = lastVmData[index];
  const cpu = parseInt(vm['CPUs']) || 0;
  const ram = parseFloat(vm['Memory']) || 0;
  const storage = parseInt(vm['Provisioned Storage (GB)']) || 0;
  const os = (vm['OS'] || '').toLowerCase();
  const octopus = os.includes('win') ? octopusFeePerWindowsVM : 0;
  const sql = vm.sqlLicensed ? calculateSqlLicenseCost(cpu, vm.sqlLicenseType) : 0;
  return (cpu * (ataPricing.cpu || 0)) + (ram * (ataPricing.ram || 0)) + (storage * (ataPricing.storage || 0)) + (ataPricing.base || 0) + octopus + sql;
}

// Calculate SQL license cost
function calculateSqlLicenseCost(cpuCount, type = 'SQL-Std') {
  const coreCount = Math.max(4, Math.ceil(parseInt(cpuCount) / 2) * 2);
  const unitPrice = ataPricing[type] || 0;
  return (coreCount / 2) * unitPrice;
}

// Update total cost summary
function updateSummary() {
  const azureTotal = lastVmData.reduce((sum, _, i) => sum + calculateAzureVMPrice(i), 0);
  const privateTotal = lastVmData.reduce((sum, _, i) => sum + calculatePrivateCloudPrice(i), 0);
  document.getElementById('totalPrice').innerText = `$${azureTotal.toFixed(2)}`;
  document.getElementById('ataPrice').innerText = `$${privateTotal.toFixed(2)}`;
}

// Populate pricing editor with input validation
function populatePricingEditor() {
  const editor = document.getElementById('pricingEditor');
  if (!editor) return;
  editor.innerHTML = '';
  const entries = ['base', 'cpu', 'ram', 'storage', 'SQL-Std', 'SQL-Ent'];
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

// Render VM table with DOM APIs
function renderVMTable(vmData) {
  if (!vmData || !vmData.length) return;
  const tbody = document.querySelector('#vmTable tbody');
  if (!tbody) return;
  tbody.innerHTML = ''; // Clear existing content
  vmData.forEach((vm, index) => {
    const cpu = parseInt(vm['Num CPU'] || vm['CPUs'] || 0);
    const ram = parseFloat(vm['Memory'] || 0);
    const storage = parseInt(vm['Provisioned Storage (GB)'] || 0);
    const os = (vm['OS'] || vm['Guest OS'] || '').includes('Windows') ? 'Windows' : 'Linux';
    const skuMatch = vm.manualSku || getPreferredSku(
      fullCatalog.filter(s => s.cpu >= cpu && s.ram >= ram * 1024),
      cpu,
      ram * 1024
    );
    matchedSkus[index] = skuMatch;
    const azurePrice = calculateAzureVMPrice(index);
    const privatePrice = calculatePrivateCloudPrice(index);

    // Calculate Azure cost breakdown for tooltip
    const sku = matchedSkus[index] || vm.manualSku;
    const sqlCost = vm.sqlLicensed ? calculateSqlLicenseCost(vm['CPUs'], vm.sqlLicenseType) : 0;
    const baseAzurePrice = sku ? (os === 'Windows' ? sku.priceWindows : sku.priceLinux) : 0;
    const azureTooltip = sku
      ? `Base VM: $${baseAzurePrice.toFixed(2)}${sqlCost ? `\nSQL License (${vm.sqlLicenseType}): $${sqlCost.toFixed(2)}` : ''}\nTotal: $${azurePrice.toFixed(2)}`
      : 'No SKU selected';

    // Calculate private cloud cost breakdown for tooltip
    const cpuCost = cpu * (ataPricing.cpu || 0);
    const ramCost = ram * (ataPricing.ram || 0);
    const storageCost = storage * (ataPricing.storage || 0);
    const baseCost = ataPricing.base || 0;
    const octopusCost = os.includes('Windows') ? octopusFeePerWindowsVM : 0;
    const privateTooltip = `CPU: $${cpuCost.toFixed(2)} (${cpu} × $${(ataPricing.cpu || 0).toFixed(2)})\n` +
                          `RAM: $${ramCost.toFixed(2)} (${ram} GB × $${(ataPricing.ram || 0).toFixed(2)})\n` +
                          `Storage: $${storageCost.toFixed(2)} (${storage} GB × $${(ataPricing.storage || 0).toFixed(2)})\n` +
                          `Base Fee: $${baseCost.toFixed(2)}\n` +
                          `Octopus Fee: $${octopusCost.toFixed(2)}${sqlCost ? `\nSQL License (${vm.sqlLicenseType}): $${sqlCost.toFixed(2)}` : ''}\n` +
                          `Total: $${privatePrice.toFixed(2)}`;

    const tr = document.createElement('tr');
    tr.title = `Azure: $${azurePrice.toFixed(2)}\nPrivate: $${privatePrice.toFixed(2)}`;
    if (!skuMatch) tr.classList.add('table-danger'); // Highlight unmatched SKUs

    // VM Name
    const tdName = document.createElement('td');
    tdName.textContent = vm['Display Name'] || vm['VM'] || 'Unnamed';
    tr.appendChild(tdName);

    // CPU
    const tdCpu = document.createElement('td');
    tdCpu.textContent = cpu;
    tr.appendChild(tdCpu);

    // RAM
    const tdRam = document.createElement('td');
    tdRam.textContent = `${ram.toFixed(1)} GB`;
    tr.appendChild(tdRam);

    // Storage
    const tdStorage = document.createElement('td');
    tdStorage.textContent = `${storage} GB`;
    tr.appendChild(tdStorage);

    // OS
    const tdOs = document.createElement('td');
    tdOs.textContent = os;
    tr.appendChild(tdOs);

    // SKU
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

    // Azure Price
    const tdAzure = document.createElement('td');
    tdAzure.textContent = `$${azurePrice.toFixed(2)}`;
    tdAzure.setAttribute('data-bs-toggle', 'tooltip');
    tdAzure.setAttribute('data-bs-placement', 'top');
    tdAzure.setAttribute('title', azureTooltip);
    tr.appendChild(tdAzure);

    // Private Price
    const tdPrivate = document.createElement('td');
    tdPrivate.textContent = `$${privatePrice.toFixed(2)}`;
    tdPrivate.setAttribute('data-bs-toggle', 'tooltip');
    tdPrivate.setAttribute('data-bs-placement', 'top');
    tdPrivate.setAttribute('title', privateTooltip);
    tr.appendChild(tdPrivate);

    // SQL License
    const tdSql = document.createElement('td');
    if (vm.sqlLicenseType) {
      const span = document.createElement('span');
      span.className = 'badge bg-success';
      span.textContent = vm.sqlLicenseType;
      const close = document.createElement('span');
      close.style.cursor = 'pointer';
      close.textContent = ' ×';
      close.onclick = () => clearSQLTag(index);
      span.appendChild(close);
      tdSql.appendChild(span);
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-outline-primary';
      btn.textContent = '+';
      btn.onclick = () => assignSQLTag(index);
      tdSql.appendChild(btn);
    }
    tr.appendChild(tdSql);

    tbody.appendChild(tr);
  });

  // Re-initialize tooltips after rendering table
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach(tooltipTriggerEl => {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });
}

// Assign SQL license tag
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

// Clear SQL license tag
function clearSQLTag(index) {
  lastVmData[index].sqlLicensed = false;
  lastVmData[index].sqlLicenseType = null;
  renderVMTable(lastVmData);
  updateSummary();
}

// Filter SKUs for modal
function filterSKUs() {
  const name = document.getElementById('filterName')?.value.toLowerCase() || '';
  const cpu = document.getElementById('filterCPU')?.value || '';
  const ram = document.getElementById('filterRAM')?.value || '';
  const filtered = fullCatalog.filter(sku => {
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
      <td>$${s.priceLinux.toFixed(2)}</td>
      <td><button class="btn btn-sm btn-success" onclick="selectSkuByName('${s.name.replace(/'/g, '')}')">✔</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// Open SKU selection modal
function openSkuPopup(index) {
  selectedRow = index;
  filterSKUs();
  new bootstrap.Modal(document.getElementById('skuModal')).show();
}

// Select SKU manually
function selectSkuByName(name) {
  const selectedSku = fullCatalog.find(s => s.name === name);
  if (selectedSku && selectedRow !== null) {
    matchedSkus[selectedRow] = selectedSku;
    lastVmData[selectedRow].manualSku = selectedSku;
    renderVMTable(lastVmData);
    updateSummary();
    bootstrap.Modal.getInstance(document.getElementById('skuModal')).hide();
  }
}

// Get preferred SKU with improved scoring
function getPreferredSku(matches, cpu, ram) {
  if (!matches.length) return null;
  const weighted = matches.map(sku => {
    const preference = preferredSeries.some(prefix => sku.name.startsWith(prefix)) ? -10 : 0;
    const cpuDiff = Math.abs(sku.cpu - cpu) * 0.4; // Lower weight for CPU
    const ramDiff = Math.abs(sku.ram - ram) * 0.6; // Higher weight for RAM
    const costPenalty = (sku.priceLinux + sku.priceWindows) / 2 * 0.01; // Consider cost in tiebreakers
    return { sku, score: cpuDiff + ramDiff + preference + costPenalty };
  });
  return weighted.sort((a, b) => a.score - b.score)[0]?.sku || null;
}
