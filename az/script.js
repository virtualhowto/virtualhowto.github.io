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

// Load Azure VM catalog from JSON
async function loadAzureVMCatalogFromJson() {
  try {
    const res = await fetch('./az_data-export.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load Azure catalog`);
    const data = await res.json();
    fullCatalog.length = 0;
    fullCatalog.push(...data.map(item => ({
      name: item.name || '',
      cpu: parseInt(item.numberOfCores) || 0,
      ram: parseInt(item.memoryInMB) || 0,
      storage: parseInt(item.osDiskSizeInMB) || 0,
      priceLinux: parseFloat(item.linuxPrice) || 0,
      priceWindows: parseFloat(item.windowsPrice) || 0
    })));
  } catch (err) {
    console.error('Azure catalog load error:', err);
    alert(`Failed to load Azure catalog: ${err.message}`);
  }
}

// Load Azure VM pricing from local JSON
async function loadAzureVMPricingFromJson() {
  try {
    const response = await fetch('./az_vm-pricing.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to load Azure VM pricing`);
    const data = await response.json();
    azureVMPricing = data.Items.map(item => ({
      name: item.armSkuName || '',
      cpu: parseInt(item.meterName?.match(/\d+/)?.[0]) || 0,
      ram: parseInt(item.productName?.match(/\d+/)?.[0]) || 0,
      storage: 0,
      priceLinux: item.productName?.includes('Windows') ? 0 : parseFloat(item.retailPrice) * 730,
      priceWindows: item.productName?.includes('Windows') ? parseFloat(item.retailPrice) * 730 : 0
    }));
    // Merge specs from catalog
    fullCatalog.forEach(catalogItem => {
      const apiItem = azureVMPricing.find(api => api.name === catalogItem.name);
      if (apiItem) {
        apiItem.cpu = catalogItem.cpu;
        apiItem.ram = catalogItem.ram;
        apiItem.storage = catalogItem.storage;
      }
    });
  } catch (err) {
    console.error('Azure VM pricing load error:', err);
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
  await loadAzureVMCatalogFromJson();
  await loadAzureVMPricingFromJson();
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

  document.getElementById('darkModeToggle')?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('darkMode', document.body.classList.contains('dark'));
  });

  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark');
  }

  document.getElementById('downloadCsv')?.addEventListener('click', () => {
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
  });

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

// XLSX reading
function readXlsx(file) {
  const spinner = document.getElementById('spinner');
  spinner.style.display = 'block';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const sheetName = wb.SheetNames.includes('vInfo') ? 'vInfo' : wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];

      const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || [];
      const storageHeader = headers.find(h => h && h.toString().toLowerCase().includes('provisioned storage'));
      if (storageHeader) {
        const headerLower = storageHeader.toLowerCase();
        if (headerLower.includes('(gib)')) storageUnit = 'GiB';
        else if (headerLower.includes('(gb)')) storageUnit = 'GB';
        else if (headerLower.includes('(mib)')) storageUnit = 'MiB';
        else if (headerLower.includes('(mb)')) storageUnit = 'hemm';
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
      alert(`XLSX parsing failed: ${err.message}. Please ensure the file is a valid RVTools export.`);
    }
  };
  reader.onerror = () => {
    spinner.style.display = 'none';
    alert('Failed to read the file. Please try again.');
  };
  reader.readAsArrayBuffer(file);
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
  const os = (vm['OS'] || '').includes('Windows') ? 'Windows' : 'Linux';
  const storage = parseFloat(vm['Provisioned Storage (GB)'] || 0);
  const diskType = vm.diskType || 'Standard SSD';
  if (!sku) return { total: 0, base: 0, storage: 0, sql: 0 };

  let basePrice = 0;
  const apiSku = azureVMPricing.find(s => s.name === sku.name);
  basePrice = apiSku ? (os === 'Windows' ? apiSku.priceWindows : apiSku.priceLinux) : 0;

  const sqlCost = vm.sqlLicensed ? calculateSqlLicenseCost(vm['CPUs'], vm.sqlLicenseType) : 0;
  const storageCost = calculateAzureStorageCost(storage, sku.storage, diskType);

System: Storage Cost (A$)', 'Private Cloud Cost (A$)', 'Tag']];
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
  });

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

// XLSX reading
function readXlsx(file) {
  const spinner = document.getElementById('spinner');
  spinner.style.display = 'block';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const sheetName = wb.SheetNames.includes('vInfo') ? 'vInfo' : wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];

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
      alert(`XLSX parsing failed: ${err.message}. Please ensure the file is a valid RVTools export.`);
    }
