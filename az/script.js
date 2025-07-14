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
    localStorage.setItem('darkMode', document
