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

function readXlsx(file) {
  document.getElementById('spinner').style.display = 'block';
  const reader = new FileReader();
  reader.onload = e => {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type: 'array' });
    const sheetName = wb.SheetNames.includes('vInfo') ? 'vInfo' : wb.SheetNames[0];
    try {
      const vmData = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
      document.getElementById('spinner').style.display = 'none';
      if (!vmData.length) return alert('No data found');
      lastVmData = vmData;
      renderVMTable(vmData);
    } catch (err) {
      document.getElementById('spinner').style.display = 'none';
      alert('XLSX parsing failed');
    }
  };
  reader.readAsArrayBuffer(file);
}

function calculateAzureStorageCost(storageGB) {
  const tiers = [
    { tier: 'P10', size: 128, unitPrice: 0.3 },
    { tier: 'P20', size: 512, unitPrice: 0.3 },
    { tier: 'P30', size: 1024, unitPrice: 0.3 }
  ];
  for (let i = tiers.length - 1; i >= 0; i--) {
    const t = tiers[i];
    if (storageGB > t.size || i === 0) {
      const disks = Math.ceil(storageGB / t.size);
      return { cost: disks * t.size * t.unitPrice, tier: t.tier, disks };
    }
  }
  return { cost: 0, tier: 'Unknown', disks: 0 };
}

function renderVMTable(vmData) {
  const tbody = document.querySelector('#vmTable tbody');
  tbody.innerHTML = '';
  matchedSkus = [];
  const preferredSeries = ['Dsv5', 'Dasv5', 'Esv5'];

  vmData.forEach((vm, i) => {
    const cpu = +vm['CPUs'] || 0;
    const ram = +vm['Memory'] || 0;
    const storage = +vm['Provisioned Storage (GB)'] || 0;
    const os = (vm['OS according to the configuration file'] || '').toLowerCase();
    const isSql = vm.sqlLicensed;
    const sqlType = vm.sqlLicenseType;

    const matches = fullCatalog.filter(s =>
      Math.abs(s.cpu - cpu) <= 1 &&
      Math.abs(s.ram - ram) <= 2048
    );

    matches.sort((a, b) => {
      const aScore = (preferredSeries.some(p => a.name.includes(p)) ? 0 : 10) + Math.abs(a.cpu - cpu) + Math.abs(a.ram - ram);
      const bScore = (preferredSeries.some(p => b.name.includes(p)) ? 0 : 10) + Math.abs(b.cpu - cpu) + Math.abs(b.ram - ram);
      return aScore - bScore;
    });

    const best = matches[0] || {};
    matchedSkus[i] = best;

    const azurePrice = os.includes('win') ? best.priceWindows : best.priceLinux;
    const azureStorage = calculateAzureStorageCost(storage);
    const sqlCost = isSql ? calculateSqlLicenseCost(cpu, sqlType) : 0;
    const totalAzure = (azurePrice + azureStorage.cost + sqlCost).toFixed(2);

    const ataPrice = ((cpu * ataPricing.unitCPU) + (ram * ataPricing.unitRAM) + (storage * ataPricing.unitStorage) +
      (os.includes('win') ? octopusFeePerWindowsVM : 0) + sqlCost).toFixed(2);

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${vm['VM']}</td>
      <td>${cpu}</td>
      <td>${ram}</td>
      <td>${storage}</td>
      <td>${os}</td>
      <td>
        <span class="text-primary" style="cursor:pointer" title="${best.name}
CPU: ${best.cpu}
RAM: ${best.ram}
Storage: ${best.storage}
Linux: $${best.priceLinux}
Windows: $${best.priceWindows}" onclick="openSkuPopup(${i})">
          ${best.name || 'Select SKU'}
        </span>
      </td>
      <td title="VM: $${azurePrice.toFixed(2)}
Storage: $${azureStorage.cost.toFixed(2)}
Tier: ${azureStorage.tier}
Disks: ${azureStorage.disks}
SQL: $${sqlCost.toFixed(2)}">
        $${totalAzure}
      </td>
      <td title="CPU: ${cpu} x $${ataPricing.unitCPU} + RAM: ${ram} x $${ataPricing.unitRAM} + Storage: ${storage} x $${ataPricing.unitStorage}${os.includes('win') ? ' + Octopus: $20' : ''}${isSql ? ' + SQL: $' + sqlCost.toFixed(2) : ''}">
        $${ataPrice}
      </td>
    `;
    tbody.appendChild(row);
  });

  updateSummary();
}

function updateSummary() {
  let azureTotal = 0;
  document.querySelectorAll('#vmTable tbody tr').forEach(row => {
    const priceCell = row.children[6];
    if (priceCell && priceCell.textContent.includes('$')) {
      azureTotal += parseFloat(priceCell.textContent.replace('$', '')) || 0;
    }
  });

  const privateTotal = lastVmData.reduce((sum, vm, i) => {
    const cpu = +vm['CPUs'] || 0;
    const ram = +vm['Memory'] || 0;
    const storage = +vm['Provisioned Storage (GB)'] || 0;
    const os = (vm['OS according to the configuration file'] || '').toLowerCase();
    const sqlCost = vm.sqlLicensed ? calculateSqlLicenseCost(cpu, vm.sqlLicenseType) : 0;
    const octopus = os.includes('win') ? octopusFeePerWindowsVM : 0;
    return sum + ((cpu * ataPricing.unitCPU) + (ram * ataPricing.unitRAM) + (storage * ataPricing.unitStorage) + octopus + sqlCost);
  }, 0);

  document.getElementById('totalPrice').innerText = `$${azureTotal.toFixed(2)}`;
  document.getElementById('ataPrice').innerText = `$${privateTotal.toFixed(2)}`;
}

function openSkuPopup(idx) {
  selectedRow = idx;
  const cpu = +lastVmData[idx]['CPUs'];
  const ram = +lastVmData[idx]['Memory'];
  const sorted = [...fullCatalog].sort((a, b) =>
    (Math.abs(a.cpu - cpu) + Math.abs(a.ram - ram)) -
    (Math.abs(b.cpu - cpu) + Math.abs(b.ram - ram))
  );
  document.getElementById('skuTableBody').innerHTML = sorted.map((s, i) => `
    <tr>
      <td>${s.name}</td>
      <td>${s.cpu}</td>
      <td>${s.ram}</td>
      <td>${s.storage}</td>
      <td>$${s.priceLinux.toFixed(2)}</td>
      <td><button class="btn btn-sm btn-success" onclick="selectSku(${i})">✔</button></td>
    </tr>
  `).join('');
  new bootstrap.Modal(document.getElementById('skuModal')).show();
}

function selectSku(idx) {
  if (selectedRow === null) return;
  matchedSkus[selectedRow] = fullCatalog[idx];
  renderVMTable(lastVmData);
  bootstrap.Modal.getInstance(document.getElementById('skuModal')).hide();
}
