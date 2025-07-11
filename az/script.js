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

document.getElementById('filterName').addEventListener('input', filterSKUs);
document.getElementById('filterCPU').addEventListener('input', filterSKUs);
document.getElementById('filterRAM').addEventListener('input', filterSKUs);

function readXlsx(file) {
  document.getElementById('spinner').style.display = 'block';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      console.log('Sheet names:', wb.SheetNames);
      const sheetName = wb.SheetNames.includes('vInfo') ? 'vInfo' : wb.SheetNames[0];
      const vmData = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
      document.getElementById('spinner').style.display = 'none';
      if (!vmData.length) return alert('No data found');
      lastVmData = vmData;
      renderVMTable(vmData);
    } catch (err) {
      document.getElementById('spinner').style.display = 'none';
      alert('XLSX parsing failed: ' + err.message);
      console.error('XLSX parse error:', err);
    }
  };
  reader.readAsArrayBuffer(file);
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
        disks: 1
      };
    }
  }

  const base = tiers[tiers.length - 1];
  const disks = Math.ceil(storageGB / base.size);
  return {
    cost: disks * base.size * base.unitPrice,
    tier: base.tier,
    disks: disks
  };
}

function calculateSqlLicenseCost(cpuCount, type = 'SQL-Std') {
  const coreCount = Math.max(4, Math.ceil(cpuCount / 2) * 2);
  const unitPrice = ataPricing[type] || 0;
  return (coreCount / 2) * unitPrice;
}

function toggleSQLTag(index) {
  const vm = lastVmData[index];
  const tagHTML = vm.sqlLicenseType
    ? `<span class="badge bg-success">${vm.sqlLicenseType} <span onclick="clearSQLTag(${index})" style="cursor:pointer">&times;</span></span>`
    : `<button class="btn btn-sm btn-outline-primary" onclick="assignSQLTag(${index})">+</button>`;
  return `<div class="sql-tags">${tagHTML}</div>`;
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

function openSkuPopup(index) {
  selectedRow = index;
  filterSKUs();
  new bootstrap.Modal(document.getElementById('skuModal')).show();
}

function filterSKUs() {
  const name = document.getElementById('filterName').value.toLowerCase();
  const cpu = document.getElementById('filterCPU').value;
  const ram = document.getElementById('filterRAM').value;

  const filtered = fullCatalog.filter(sku => {
    return (
      (!name || sku.name.toLowerCase().includes(name)) &&
      (!cpu || sku.cpu.toString().includes(cpu)) &&
      (!ram || sku.ram.toString().includes(ram))
    );
  });

  document.getElementById('skuTableBody').innerHTML = filtered
    .map(
      (s, i) => `
        <tr>
          <td>${s.name}</td>
          <td>${s.cpu}</td>
          <td>${s.ram}</td>
          <td>${s.storage}</td>
          <td>$${s.priceLinux.toFixed(2)}</td>
          <td><button class="btn btn-sm btn-success" onclick="selectSkuByName('${s.name.replace(/'/g, '')}')">✔</button></td>
        </tr>
      `
    )
    .join('');
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
    const octopus = os.includes('win') ? octopusFeePerWindowsVM : 0;
    const sql = vm.sqlLicensed ? calculateSqlLicenseCost(cpu, vm.sqlLicenseType) : 0;
    return sum + ((cpu * ataPricing.unitCPU) + (ram * ataPricing.unitRAM) + (storage * ataPricing.unitStorage) + octopus + sql);
  }, 0);

  document.getElementById('totalPrice').innerText = `$${azureTotal.toFixed(2)}`;
  document.getElementById('ataPrice').innerText = `$${privateTotal.toFixed(2)}`;
}

// Apply preferred series matching
function getPreferredSku(matches, cpu, ram) {
  const weighted = matches.map(sku => {
    const preference = preferredSeries.some(prefix => sku.name.startsWith(prefix)) ? -10 : 0;
    const score = Math.abs(sku.cpu - cpu) + Math.abs(sku.ram - ram) + preference;
    return { sku, score };
  });
  return weighted.sort((a, b) => a.score - b.score)[0]?.sku || matches[0];
}
