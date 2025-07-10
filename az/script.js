// RVTools Matcher - JavaScript Logic

let fullCatalog = [];
let ataPricing = {};
let selectedRow = null;
let lastVmData = [];
let matchedSkus = [];
const octopusFeePerWindowsVM = 20;

// Load Azure and Private pricing catalogs
fetch('./az_data-export.json')
  .then(res => res.json())
  .then(data => {
    fullCatalog = data.map(item => ({
      name: item.name,
      cpu: item.numberOfCores,
      ram: item.memoryInMB,
      storage: item.osDiskSizeInMB || 0,
      priceLinux: parseFloat(item.linuxPrice) || 0,
      priceWindows: parseFloat(item.windowsPrice) || 0
    }));
  });

fetch('./cld-pricing.json')
  .then(res => res.json())
  .then(data => {
    ataPricing = data;
  });

// Handle file input
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', event => {
  if (event.target.files.length) {
    readXlsx(event.target.files[0]);
  }
});

function calculateSqlLicenseCost(cpuCount, type = 'SQL-Std') {
  const coreCount = Math.max(4, Math.ceil(cpuCount / 2) * 2);
  const unitPrice = ataPricing[type] || 0;
  return (coreCount / 2) * unitPrice;
}

function getSqlTagHtml(index) {
  return `
    <div class="form-check">
      <input class="form-check-input sql-checkbox" type="checkbox" id="sqlTag-${index}" onchange="updateSQLTag(${index})">
      <label class="form-check-label" for="sqlTag-${index}">SQL Std</label>
      <input class="form-check-input sql-checkbox ms-2" type="checkbox" id="sqlEntTag-${index}" onchange="updateSQLTag(${index}, true)">
      <label class="form-check-label" for="sqlEntTag-${index}">SQL Ent</label>
    </div>
  `;
}

function updateSQLTag(index, isEnt = false) {
  const std = document.getElementById(`sqlTag-${index}`).checked;
  const ent = document.getElementById(`sqlEntTag-${index}`).checked;
  lastVmData[index].sqlLicensed = std || ent;
  lastVmData[index].sqlLicenseType = ent ? 'SQL-Ent' : std ? 'SQL-Std' : null;
  renderVMTable(lastVmData);
}

// ... rest of script remains unchanged ...
