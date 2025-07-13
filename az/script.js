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
  .then(data => { ataPricing = data; populatePricingEditor(); });

const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', event => {
  if (event.target.files.length) {
    previewSheetOptions(event.target.files[0]);
  }
});

document.getElementById('filterName').addEventListener('input', filterSKUs);
document.getElementById('filterCPU').addEventListener('input', filterSKUs);
document.getElementById('filterRAM').addEventListener('input', filterSKUs);
document.getElementById('darkModeToggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
});

document.getElementById('downloadCsv').addEventListener('click', () => {
  const rows = [['VM Name', 'CPU', 'RAM', 'Storage', 'OS', 'SKU', 'Azure Cost', 'Private Cloud Cost', 'SQL']];
  lastVmData.forEach((vm, i) => {
    rows.push([
      vm['Display Name'] || vm['VM'] || 'Unnamed',
      vm['Num CPU'] || vm['CPUs'] || '',
      vm['Memory'] || '',
      vm['Provisioned Storage (GB)'] || '',
      (vm['OS'] || vm['Guest OS'] || '').includes('Windows') ? 'Windows' : 'Linux',
      matchedSkus[i]?.name || 'No Match',
      document.querySelector(`#vmTable tbody tr:nth-child(${i + 1}) td:nth-child(7)`).innerText,
      document.querySelector(`#vmTable tbody tr:nth-child(${i + 1}) td:nth-child(8)`).innerText,
      vm.sqlLicenseType || ''
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

function populatePricingEditor() {
  const editor = document.getElementById('pricingEditor');
  if (!editor) return;
  editor.innerHTML = '';
  const entries = ['base', 'cpu', 'ram', 'storage', 'SQL-Std', 'SQL-Ent'];
  entries.forEach(key => {
    const div = document.createElement('div');
    div.innerHTML = `
      <label>${key}: </label>
      <input type="number" step="0.01" value="${ataPricing[key] || 0}" onchange="ataPricing['${key}'] = parseFloat(this.value); renderVMTable(lastVmData);">
    `;
    editor.appendChild(div);
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
      (!ram || (sku.ram / 1024).toFixed(1).includes(ram))
    );
  });

  document.getElementById('skuTableBody').innerHTML = filtered
    .map(
      (s, i) => `
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

function selectSkuByName(name) {
  const selectedSku = fullCatalog.find(s => s.name === name);
  if (selectedSku && selectedRow !== null) {
    matchedSkus[selectedRow] = selectedSku;
    lastVmData[selectedRow].manualSku = selectedSku;
    renderVMTable(lastVmData);
    bootstrap.Modal.getInstance(document.getElementById('skuModal')).hide();
  }
}

function openSkuPopup(index) {
  selectedRow = index;
  filterSKUs();
  new bootstrap.Modal(document.getElementById('skuModal')).show();
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
