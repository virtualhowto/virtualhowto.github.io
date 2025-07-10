let fullCatalog = [];
let ataPricing = {};
let selectedRow = null;
let lastVmData = [];
let matchedSkus = [];
const octopusFeePerWindowsVM = 20;

fetch('./az_data-export.json')
  .then(r => r.json())
  .then(data => {
    fullCatalog = data.map(d => ({
      name: d.name,
      cpu: d.numberOfCores,
      ram: d.memoryInMB,
      storage: d.osDiskSizeInMB || 0,
      priceLinux: parseFloat(d.linuxPrice) || 0,
      priceWindows: parseFloat(d.windowsPrice) || 0
    }));
  });

fetch('./cld-pricing.json')
  .then(r => r.json())
  .then(data => {
    ataPricing = data;
  });

function showToast(id) {
  new bootstrap.Toast(document.getElementById(id)).show();
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
      if (!vmData.length) return showToast('toastError');
      lastVmData = vmData;
      renderVMTable(vmData);
      showToast('toastSuccess');
    } catch (err) {
      document.getElementById('spinner').style.display = 'none';
      console.error('❌ XLSX parsing failed:', err);
      showToast('toastError');
    }
  };
  reader.readAsArrayBuffer(file);
}

document.getElementById('fileInput').addEventListener('change', e => {
  if (e.target.files.length) readXlsx(e.target.files[0]);
});

function renderVMTable(vmData) {
  const tbody = document.querySelector('#vmTable tbody');
  tbody.innerHTML = '';
  matchedSkus = [];

  vmData.forEach((vm, i) => {
    const cpu = +vm['CPUs'] || 0;
    const ram = +vm['Memory'] || 0;
    const storage = +vm['Provisioned Storage (GB)'] || 0;
    const os = (vm['OS according to the configuration file'] || '').toLowerCase();

    // Match SKU
    const matches = fullCatalog.filter(s => Math.abs(s.cpu - cpu) <= 1 && Math.abs(s.ram - ram) <= 2);
    const best = matches.sort((a,b) => (Math.abs(a.cpu-cpu)+Math.abs(a.ram-ram)) - (Math.abs(b.cpu-cpu)+Math.abs(b.ram-ram)))[0] || {};
    matchedSkus[i] = best;

    const azurePrice = os.includes('win') ? best.priceWindows : best.priceLinux;
    const azureStoragePrice = storage * 0.30;
    const ataPrice = (cpu * ataPricing.unitCPU) + (ram * ataPricing.unitRAM) + (storage * ataPricing.unitStorage) + (os.includes('win') ? octopusFeePerWindowsVM : 0);

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${vm['VM']}</td>
      <td>${cpu}</td>
      <td>${ram}</td>
      <td>${storage}</td>
      <td>${os}</td>
      <td>
        <span title="Name: ${best.name || 'N/A'}
CPU: ${best.cpu} cores
RAM: ${best.ram} MB
Storage: ${best.storage} MB
Linux Price: $${best.priceLinux?.toFixed(2)}
Windows Price: $${best.priceWindows?.toFixed(2)}"
        class="text-primary" style="cursor:pointer" onclick="openSkuPopup(${i})">${best.name || 'Select SKU'}</span>
      </td>
      <td title="VM: $${azurePrice?.toFixed(2)} + Storage: $${azureStoragePrice.toFixed(2)} = Total">
        $${(azurePrice + azureStoragePrice).toFixed(2)}
      </td>
      <td title="CPU: ${cpu} × $${ataPricing.unitCPU} + RAM: ${ram} × $${ataPricing.unitRAM} + Storage: ${storage} × $${ataPricing.unitStorage} + Octopus: $${os.includes('win') ? octopusFeePerWindowsVM : 0}">
        $${ataPrice.toFixed(2)}
      </td>
    `;
    tbody.appendChild(row);
  });

  updateSummary();
}

function openSkuPopup(idx) {
  selectedRow = idx;
  const cpu = +lastVmData[idx]['CPUs'];
  const ram = +lastVmData[idx]['Memory'];
  const sorted = [...fullCatalog].sort((a,b) => (Math.abs(a.cpu-cpu)+Math.abs(a.ram-ram)) - (Math.abs(b.cpu-cpu)+Math.abs(b.ram-ram)));
  document.getElementById('skuTableBody').innerHTML = sorted.map((s,i)=>`
    <tr>
      <td>${s.name}</td>
      <td>${s.cpu}</td>
      <td>${s.ram}</td>
      <td>${s.storage}</td>
      <td>$${(s.priceLinux).toFixed(2)}</td>
      <td><button class="btn btn-sm btn-success" onclick="selectSku(${i})">✔</button></td>
    </tr>
  `).join('');
  new bootstrap.Modal(document.getElementById('skuModal')).show();
}

function selectSku(idx) {
  const sku = fullCatalog[idx];
  matchedSkus[selectedRow] = sku;
  renderVMTable(lastVmData);
  bootstrap.Modal.getInstance(document.getElementById('skuModal')).hide();
}

['filterName','filterCPU','filterRAM'].forEach(id=>{
  document.getElementById(id).addEventListener('input', ()=>{
    const nameV=document.getElementById('filterName').value.toLowerCase();
    const cpuV=document.getElementById('filterCPU').value;
    const ramV=document.getElementById('filterRAM').value;
    const filtered=fullCatalog.filter(s=>
      (!nameV||s.name.toLowerCase().includes(nameV))&&
      (!cpuV||s.cpu.toString().includes(cpuV))&&
      (!ramV||s.ram.toString().includes(ramV))
    );
    document.getElementById('skuTableBody').innerHTML=filtered.map(s=>`
      <tr>
        <td>${s.name}</td><td>${s.cpu}</td><td>${s.ram}</td><td>${s.storage}</td><td>$${s.priceLinux.toFixed(2)}</td><td><button class="btn btn-sm btn-success" onclick="selectSku(${fullCatalog.indexOf(s)})">✔</button></td>
      </tr>
    `).join('');
  });
});

function updateSummary() {
  let azureTotal = 0;
  document.querySelectorAll('#vmTable tbody tr').forEach(row => {
    const priceCell = row.children[6];
    if (priceCell && priceCell.textContent.includes('$')) {
      azureTotal += parseFloat(priceCell.textContent.replace('$', '')) || 0;
    }
  }
