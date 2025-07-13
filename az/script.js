// RVTools Matcher - JavaScript Logic

let fullCatalog = [];
let ataPricing = {};
let selectedRow = null;
let lastVmData = [];
let matchedSkus = [];
const octopusFeePerWindowsVM = 20;
const preferredSeries = ['Dsv5', 'Dasv5', 'Esv5'];

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
  .then(data => { ataPricing = data; });

const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', event => {
  if (event.target.files.length) {
    previewSheetOptions(event.target.files[0]);
  }
});

document.getElementById('filterName').addEventListener('input', filterSKUs);
document.getElementById('filterCPU').addEventListener('input', filterSKUs);
document.getElementById('filterRAM').addEventListener('input', filterSKUs);

function previewSheetOptions(file) {
  document.getElementById('spinner').style.display = 'block';
  const reader = new FileReader();

  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });

      const sheetList = wb.SheetNames.map(sheetName => {
        const sheet = wb.Sheets[sheetName];
        const headers = Object.keys(XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || {});
        return { name: sheetName, headers };
      });

      const sheetSelectHtml = sheetList.map(s => `
        <option value="${s.name}">${s.name} - [${s.headers.join(', ')}]</option>
      `).join('');

      document.getElementById('sheetSelect').innerHTML = sheetSelectHtml;
      document.getElementById('sheetPickerContainer').style.display = 'block';
      window._pendingWorkbook = wb;
      document.getElementById('spinner').style.display = 'none';

    } catch (err) {
      document.getElementById('spinner').style.display = 'none';
      alert('Failed to parse XLSX');
    }
  };

  reader.readAsArrayBuffer(file);
}

function loadSelectedSheet() {
  const sheetName = document.getElementById('sheetSelect').value;
  const wb = window._pendingWorkbook;
  if (!wb || !sheetName) return alert('Workbook or sheet not available');

  const sheet = wb.Sheets[sheetName];
  const vmData = XLSX.utils.sheet_to_json(sheet);

  if (!vmData.length) return alert('No data found in sheet');

  lastVmData = vmData;
  renderVMTable(vmData);
  document.getElementById('sheetPickerContainer').style.display = 'none';
}

function calculateAzureStorageCost(storageGB) {
  const tiers = [
    { tier: 'P10', size: 128, unitPrice: 0.30 },
    { tier: 'P20', size: 512, unitPrice: 0.30 },
    { tier: 'P30', size: 1024, unitPrice: 0.30 }
  ];

  for (let t of tiers) {
    if (storageGB <= t.size) {
      return {
        cost: t.size * t.unitPrice,
        tier: t.tier,
        disks: 1,
        provisionedSize: t.size
      };
    }
  }

  const base = tiers[tiers.length - 1];
  const disks = Math.ceil(storageGB / base.size);
  return {
    cost: disks * base.size * base.unitPrice,
    tier: base.tier,
    disks: disks,
    provisionedSize: disks * base.size
  };
}

function renderVMTable(vmData) {
  const tbody = document.querySelector('#vmTable tbody');
  tbody.innerHTML = '';

  vmData.forEach((vm, index) => {
    const cpu = parseInt(vm['Num CPU'] || vm['CPUs'] || 0);
    const ram = parseFloat(vm['Memory'] || 0); // GB
    const storage = parseInt(vm['Provisioned Storage (GB)'] || 0); // GB
    const os = (vm['OS'] || vm['Guest OS'] || '').includes('Windows') ? 'Windows' : 'Linux';

    const skuMatch = vm.manualSku || getPreferredSku(
      fullCatalog.filter(s => s.cpu >= cpu && s.ram >= ram * 1024),
      cpu,
      ram * 1024
    );

    matchedSkus[index] = skuMatch;

    const storageCost = calculateAzureStorageCost(storage || 127);

    const sqlTagHTML = vm.sqlLicenseType
      ? `<span class="badge bg-success">${vm.sqlLicenseType} <span onclick="clearSQLTag(${index})" style="cursor:pointer">&times;</span></span>`
      : `<button class="btn btn-sm btn-outline-primary" onclick="assignSQLTag(${index})">+</button>`;

    const skuName = skuMatch ? skuMatch.name : '<em>No Match</em>';
    const skuFix = skuMatch ? '' : `<button class="btn btn-sm btn-warning" onclick="openSkuPopup(${index})">Fix</button>`;

    tbody.innerHTML += `
      <tr>
        <td>${vm['Display Name'] || vm['VM'] || 'Unnamed'}</td>
        <td>${cpu}</td>
        <td>${ram.toFixed(1)} GB</td>
        <td>${storage} GB (${storageCost.tier})</td>
        <td>${os}</td>
        <td>${skuName} ${skuFix}</td>
        <td>${sqlTagHTML}</td>
      </tr>
    `;
  });
}

function filterSKUs() {
  const name = document.getElementById('filterName').value.toLowerCase();
  const cpu = document.getElementById('filterCPU').value;
  const ram = document.getElementById('filterRAM').value;

  const filtered = fullCatalog.filter(sku => {
    return (
      (!name || sku.name.toLowerCase().includes(name)) &&
      (!cpu || sku.cpu.toString().includes(cpu)) &&
      (!ram || (sku.ram / 1024).toString().includes(ram))
    );
  });

  document.getElementById('skuTableBody').innerHTML = filtered
    .map(
      s => `
        <tr>
          <td>${s.name}</td>
          <td>${s.cpu}</td>
          <td>${(s.ram / 1024).toFixed(1)} GB</td>
          <td>${(s.storage / 1024).toFixed(1)} GB</td>
          <td>$${s.priceLinux.toFixed(2)}</td>
          <td><button class="btn btn-sm btn-success" onclick="selectSkuByName('${s.name.replace(/'/g, '')}')">✔</button></td>
        </tr>
      `
    )
    .join('');
}

function openSkuPopup(index) {
  selectedRow = index;
  filterSKUs();
  new bootstrap.Modal(document.getElementById('skuModal')).show();
}

function selectSkuByName(name) {
  const selectedSku = fullCatalog.find(s => s.name === name);
  if (selectedSku && selectedRow !== null) {
    matchedSkus[selectedRow] = selectedSku;
    lastVmData[selectedRow].manualSku = selectedSku;
    renderVMTable(lastVmData);
    bootstrap.Modal.getInstance(document.getElementById('skuModal')).hide();
  }
}

function assignSQLTag(index) {
  const tag = prompt('Enter SQL License Tag (SQL-Std or SQL-Ent):');
  if (tag === 'SQL-Std' || tag === 'SQL-Ent') {
    lastVmData[index].sqlLicensed = true;
    lastVmData[index].sqlLicenseType = tag;
    renderVMTable(lastVmData);
  } else {
    alert('Invalid tag. Use SQL-Std or SQL-Ent.');
  }
}

function clearSQLTag(index) {
  lastVmData[index].sqlLicensed = false;
  lastVmData[index].sqlLicenseType = null;
  renderVMTable(lastVmData);
}

function getPreferredSku(matches, cpu, ram) {
  const weighted = matches.map(sku => {
    const preference = preferredSeries.some(prefix => sku.name.startsWith(prefix)) ? -10 : 0;
    const score = Math.abs(sku.cpu - cpu) + Math.abs(sku.ram - ram) + preference;
    return { sku, score };
  });
  return weighted.sort((a, b) => a.score - b.score)[0]?.sku || matches[0];
}
