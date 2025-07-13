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
    populatePricingEditor();
    updateSummary();
  });

window.onload = () => {
  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', event => {
      if (event.target.files.length) {
        readXlsx(event.target.files[0]);
      }
    });
  }

  document.getElementById('filterName')?.addEventListener('input', filterSKUs);
  document.getElementById('filterCPU')?.addEventListener('input', filterSKUs);
  document.getElementById('filterRAM')?.addEventListener('input', filterSKUs);
  document.getElementById('darkModeToggle')?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('darkMode', document.body.classList.contains('dark'));
  });

  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark');
  }

  document.getElementById('downloadCsv')?.addEventListener('click', () => {
    const rows = [['VM Name', 'CPU', 'RAM', 'Storage', 'OS', 'SKU', 'Azure Cost', 'Private Cloud Cost', 'SQL']];
    lastVmData.forEach((vm, i) => {
      rows.push([
        vm['Display Name'] || vm['VM'] || 'Unnamed',
        vm['Num CPU'] || vm['CPUs'] || '',
        vm['Memory'] || '',
        vm['Provisioned Storage (GB)'] || '',
        (vm['OS'] || vm['Guest OS'] || '').includes('Windows') ? 'Windows' : 'Linux',
        matchedSkus[i]?.name || 'No Match',
        `$${calculateAzureVMPrice(i).toFixed(2)}`,
        `$${calculatePrivateCloudPrice(i).toFixed(2)}`,
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
};

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
      alert('XLSX parsing failed: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function calculateAzureVMPrice(index) {
  const sku = matchedSkus[index] || lastVmData[index].manualSku;
  const os = (lastVmData[index]['OS'] || '').includes('Windows') ? 'Windows' : 'Linux';
  if (!sku) return 0;
  const sql = lastVmData[index].sqlLicensed ? calculateSqlLicenseCost(lastVmData[index]['CPUs'], lastVmData[index].sqlLicenseType) : 0;
  return (os === 'Windows' ? sku.priceWindows : sku.priceLinux) + sql;
}

function calculatePrivateCloudPrice(index) {
  const vm = lastVmData[index];
  const cpu = +vm['CPUs'] || 0;
  const ram = +vm['Memory'] || 0;
  const storage = +vm['Provisioned Storage (GB)'] || 0;
  const os = (vm['OS'] || '').toLowerCase();
  const octopus = os.includes('win') ? octopusFeePerWindowsVM : 0;
  const sql = vm.sqlLicensed ? calculateSqlLicenseCost(cpu, vm.sqlLicenseType) : 0;
  return (cpu * ataPricing.cpu) + (ram * ataPricing.ram) + (storage * ataPricing.storage) + (ataPricing.base || 0) + octopus + sql;
}

function updateSummary() {
  const azureTotal = lastVmData.reduce((sum, _, i) => sum + calculateAzureVMPrice(i), 0);
  const privateTotal = lastVmData.reduce((sum, _, i) => sum + calculatePrivateCloudPrice(i), 0);
  document.getElementById('totalPrice').innerText = `$${azureTotal.toFixed(2)}`;
  document.getElementById('ataPrice').innerText = `$${privateTotal.toFixed(2)}`;
}

function populatePricingEditor() {
  const editor = document.getElementById('pricingEditor');
  if (!editor) return;
  editor.innerHTML = '';
  const entries = ['base', 'cpu', 'ram', 'storage', 'SQL-Std', 'SQL-Ent'];
  entries.forEach(key => {
    const div = document.createElement('div');
    div.innerHTML = `
      <label>${key}: </label>
      <input type="number" step="0.01" value="${ataPricing[key] || 0}" onchange="ataPricing['${key}'] = parseFloat(this.value); renderVMTable(lastVmData); updateSummary();">
    `;
    editor.appendChild(div);
  });
}

function renderVMTable(vmData) {
  const tbody = document.querySelector('#vmTable tbody');
  tbody.innerHTML = '';
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
    const azurePrice = calculateAzureVMPrice(index).toFixed(2);
    const privatePrice = calculatePrivateCloudPrice(index).toFixed(2);
    const sqlHTML = vm.sqlLicenseType
      ? `<span class="badge bg-success">${vm.sqlLicenseType} <span onclick="clearSQLTag(${index})" style="cursor:pointer">&times;</span></span>`
      : `<button class="btn btn-sm btn-outline-primary" onclick="assignSQLTag(${index})">+</button>`;
    const skuName = skuMatch ? skuMatch.name : '<em>No Match</em>';
    const skuFix = skuMatch ? '' : `<button class="btn btn-sm btn-warning" onclick="openSkuPopup(${index})">Fix</button>`;
    tbody.innerHTML += `
      <tr>
        <td>${vm['Display Name'] || vm['VM'] || 'Unnamed'}</td>
        <td>${cpu}</td>
        <td>${ram.toFixed(1)} GB</td>
        <td>${storage} GB</td>
        <td>${os}</td>
        <td>${skuName} ${skuFix}</td>
        <td>$${azurePrice}</td>
        <td>$${privatePrice}</td>
        <td>${sqlHTML}</td>
      </tr>
    `;
  });
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

function filterSKUs() {
  const name = document.getElementById('filterName')?.value.toLowerCase();
  const cpu = document.getElementById('filterCPU')?.value;
  const ram = document.getElementById('filterRAM')?.value;
  const filtered = fullCatalog.filter(sku => {
    return (
      (!name || sku.name.toLowerCase().includes(name)) &&
      (!cpu || sku.cpu.toString().includes(cpu)) &&
      (!ram || sku.ram.toString().includes(ram))
    );
  });
  document.getElementById('skuTableBody').innerHTML = filtered.map(s => `
    <tr>
      <td>${s.name}</td>
      <td>${s.cpu}</td>
      <td>${(s.ram / 1024).toFixed(1)} GB</td>
      <td>${(s.storage / 1024).toFixed(1)} GB</td>
      <td>$${s.priceLinux.toFixed(2)}</td>
      <td><button class="btn btn-sm btn-success" onclick="selectSkuByName('${s.name.replace(/'/g, '')}')">✔</button></td>
    </tr>
  `).join('');
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

function calculateSqlLicenseCost(cpuCount, type = 'SQL-Std') {
  const coreCount = Math.max(4, Math.ceil(cpuCount / 2) * 2);
  const unitPrice = ataPricing[type] || 0;
  return (coreCount / 2) * unitPrice;
}

function getPreferredSku(matches, cpu, ram) {
  const weighted = matches.map(sku => {
    const preference = preferredSeries.some(prefix => sku.name.startsWith(prefix)) ? -10 : 0;
    const score = Math.abs(sku.cpu - cpu) + Math.abs(sku.ram - ram) + preference;
    return { sku, score };
  });
  return weighted.sort((a, b) => a.score - b.score)[0]?.sku || matches[0];
}
