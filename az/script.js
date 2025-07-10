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
  .then(data => { ataPricing = data; });

// Handle file input
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', event => {
  if (event.target.files.length) {
    readXlsx(event.target.files[0]);
  }
});

function setupSkuFilter(data) {
  const nameInput = document.getElementById('filterName');
  const cpuInput = document.getElementById('filterCPU');
  const ramInput = document.getElementById('filterRAM');

  const filterHandler = () => {
    const nameVal = nameInput.value.toLowerCase();
    const cpuVal = cpuInput.value;
    const ramVal = ramInput.value;

    const filtered = data.filter(item => {
      const nameMatch = item.name.toLowerCase().includes(nameVal);
      const cpuMatch = cpuVal === '' || item.cpu == cpuVal;
      const ramMatch = ramVal === '' || item.ram == ramVal;
      return nameMatch && cpuMatch && ramMatch;
    });

    document.getElementById('skuTableBody').innerHTML = [
    `<tr class='table-info'>
      <td colspan="6" class="text-center">
        <button class="btn btn-outline-primary btn-sm" onclick="selectBestSku()">Use Best Match</button>
      </td>
    </tr>`,
    ...filtered.map((s, i) => `
      <tr>
        <td>${s.name}</td>
        <td>${s.cpu}</td>
        <td>${s.ram}</td>
        <td>${s.storage}</td>
        <td>$${s.priceLinux.toFixed(2)}</td>
        <td><button class="btn btn-sm btn-success" onclick="selectSkuFromFilter('${s.name}')">✔</button></td>
      </tr>
    `)
  ].join('');
  };

  nameInput.oninput = filterHandler;
  cpuInput.oninput = filterHandler;
  ramInput.oninput = filterHandler;
  filterHandler();
}

function selectBestSku() {
  const vm = lastVmData[selectedRow];
  const cpu = +vm['CPUs'] || 0;
  const ram = +vm['Memory'] || 0;

  const matches = fullCatalog.filter(sku =>
    Math.abs(sku.cpu - cpu) <= 1 &&
    Math.abs(sku.ram - ram) <= 2048
  );

  const bestMatch = matches.sort((a, b) =>
    (Math.abs(a.cpu - cpu) + Math.abs(a.ram - ram)) -
    (Math.abs(b.cpu - cpu) + Math.abs(b.ram - ram))
  )[0];

  if (bestMatch) {
    matchedSkus[selectedRow] = bestMatch;
    renderVMTable(lastVmData);
    bootstrap.Modal.getInstance(document.getElementById('skuModal')).hide();
  }
}

function selectSkuFromFilter(name) {
  const sku = fullCatalog.find(s => s.name === name);
  if (!sku) return;
  matchedSkus[selectedRow] = { ...sku, manual: true };
  renderVMTable(lastVmData);
  renderVMTable(lastVmData);
  // Re-render only the updated row to avoid resetting all
  renderVMTable(lastVmData);
  bootstrap.Modal.getInstance(document.getElementById('skuModal')).hide();
}

function readXlsx(file) {
  document.getElementById('spinner').style.display = 'block';
  const reader = new FileReader();

  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const sheetName = wb.SheetNames.includes('vInfo') ? 'vInfo' : wb.SheetNames[0];
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
  const unitPrice = 0.30;
  let tier = 'P30';
  let baseSize = 1024;

  if (storageGB <= 128) {
    tier = 'P10';
    baseSize = 128;
  } else if (storageGB <= 512) {
    tier = 'P20';
    baseSize = 512;
  } else if (storageGB <= 1024) {
    tier = 'P30';
    baseSize = 1024;
  } else {
    tier = `P${Math.ceil(storageGB / 1024) * 30}`;
    baseSize = 1024;
  }

  const diskCount = Math.ceil(storageGB / baseSize);
  const provisionedSize = diskCount * baseSize;
  const cost = provisionedSize * unitPrice;

  return {
    tier,
    cost,
    diskCount,
    provisionedSize
  };
}

function renderVMTable(vmData) {
  const tbody = document.querySelector('#vmTable tbody');
  tbody.innerHTML = '';
  // Do not reset manually selected SKUs here

  vmData.forEach((vm, i) => {
    const cpu = +vm['CPUs'] || 0;
    const ram = +vm['Memory'] || 0;
    const storage = +vm['Provisioned Storage (GB)'] || 0;
    const os = (vm['OS according to the configuration file'] || '').toLowerCase();

    const matches = fullCatalog.filter(sku =>
      Math.abs(sku.cpu - cpu) <= 1 &&
      Math.abs(sku.ram - ram) <= 2048
    );

    const bestMatch = matches.sort((a, b) =>
      (Math.abs(a.cpu - cpu) + Math.abs(a.ram - ram)) -
      (Math.abs(b.cpu - cpu) + Math.abs(b.ram - ram))
    )[0] || {};

    matchedSkus[i] = matchedSkus[i] && matchedSkus[i].manual ? matchedSkus[i] : bestMatch;

    const azurePrice = os.includes('win') ? bestMatch.priceWindows : bestMatch.priceLinux;
    const azureStorage = calculateAzureStorageCost(storage);
    const azureTotal = (azurePrice + azureStorage.cost).toFixed(2);

    const privatePrice = (
      (cpu * ataPricing.unitCPU) +
      (ram * ataPricing.unitRAM) +
      (storage * ataPricing.unitStorage) +
      (os.includes('win') ? octopusFeePerWindowsVM : 0)
    ).toFixed(2);

    tbody.innerHTML += `
      <tr>
        <td>${vm['VM']}</td>
        <td>${cpu}</td>
        <td>${ram}</td>
        <td>${storage}</td>
        <td>${os}</td>
        <td><span class="text-primary" style="cursor:pointer" onclick="openSkuPopup(${i})">${bestMatch.name || 'Select SKU'}</span></td>
        <td title="VM Cost: $${azurePrice.toFixed(2)}
Storage Cost: $${azureStorage.cost.toFixed(2)}
Storage Tier: ${azureStorage.tier}
Disks: ${azureStorage.diskCount} x ${azureStorage.provisionedSize / azureStorage.diskCount}GB">$${azureTotal}</td>
        <td title="CPU: ${cpu} x $${ataPricing.unitCPU}
RAM: ${ram} x $${ataPricing.unitRAM}
Storage: ${storage} x $${ataPricing.unitStorage}${os.includes('win') ? '\\nOctopus: $20' : ''}">$${privatePrice}</td>
      </tr>
    `;
  });

  updateSummary();
}

function updateSummary() {
  let azureTotal = 0;
  document.querySelectorAll('#vmTable tbody tr').forEach(row => {
    const cell = row.children[6];
    if (cell && cell.textContent.includes('$')) {
      azureTotal += parseFloat(cell.textContent.replace('$', '')) || 0;
    }
  });

  const privateTotal = lastVmData.reduce((sum, vm, i) => {
    const cpu = +vm['CPUs'] || 0;
    const ram = +vm['Memory'] || 0;
    const storage = +vm['Provisioned Storage (GB)'] || 0;
    const os = (vm['OS according to the configuration file'] || '').toLowerCase();
    const octopus = os.includes('win') ? octopusFeePerWindowsVM : 0;
    return sum + ((cpu * ataPricing.unitCPU) + (ram * ataPricing.unitRAM) + (storage * ataPricing.unitStorage) + octopus);
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

  document.getElementById('filterName').value = '';
  document.getElementById('filterCPU').value = '';
  document.getElementById('filterRAM').value = '';

  setupSkuFilter(sorted);

  new bootstrap.Modal(document.getElementById('skuModal')).show();
}

function exportCSV(type) {
  let csv = 'VM,CPU,RAM,Storage,OS,SKU,Azure VM Cost,Azure Storage,Storage Tier,Azure Total
';

  lastVmData.forEach((vm, i) => {
    const cpu = +vm['CPUs'] || 0;
    const ram = +vm['Memory'] || 0;
    const storage = +vm['Provisioned Storage (GB)'] || 0;
    const os = (vm['OS according to the configuration file'] || '').toLowerCase();
    const sku = matchedSkus[i]?.name || '';
    const azurePrice = os.includes('win') ? matchedSkus[i]?.priceWindows || 0 : matchedSkus[i]?.priceLinux || 0;
    const azureStorage = calculateAzureStorageCost(storage);
    const azureTotal = (azurePrice + azureStorage.cost).toFixed(2);

    if (type === 'azure') {
      csv += `"${vm['VM']}",${cpu},${ram},${storage},${os},"${sku}",${azurePrice.toFixed(2)},${azureStorage.cost.toFixed(2)},${azureStorage.tier},${azureTotal}
`;
    }
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${type}_summary.csv`;
  link.click();
}
}
