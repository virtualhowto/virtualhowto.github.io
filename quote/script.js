let rawData = [];
let selectedRows = [];
let bundles = [];

document.getElementById("uploadExcel").addEventListener("change", handleFile);

function handleFile(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        displayColumnMapping(rawData[0]);
    };
    reader.readAsArrayBuffer(file);
}

function displayColumnMapping(headers) {
    let mappingDiv = document.getElementById("columnMapping");
    mappingDiv.innerHTML = "<h3>Map Columns</h3>";
    headers.forEach((header, index) => {
        mappingDiv.innerHTML += `
            <label>${header}: 
                <select id="col_${index}">
                    <option value="">Ignore</option>
                    <option value="description">Description</option>
                    <option value="cost">Cost</option>
                    <option value="quantity">Quantity</option>
                </select>
            </label><br>`;
    });
}

function importData() {
    let mappings = {};
    rawData[0].forEach((header, index) => {
        let selectedValue = document.getElementById(`col_${index}`).value;
        if (selectedValue) mappings[selectedValue] = index;
    });

    let tableHeaders = document.getElementById("tableHeaders");
    let tableBody = document.getElementById("tableBody");
    tableHeaders.innerHTML = "";
    tableBody.innerHTML = "";

    Object.keys(mappings).forEach(key => {
        let th = document.createElement("th");
        th.innerText = key.charAt(0).toUpperCase() + key.slice(1);
        tableHeaders.appendChild(th);
    });

    rawData.slice(1).forEach((row, rowIndex) => {
        let tr = document.createElement("tr");
        tr.setAttribute("data-index", rowIndex);
        tr.onclick = () => toggleSelection(rowIndex, tr);

        Object.values(mappings).forEach(index => {
            let td = document.createElement("td");
            td.innerText = row[index] || "";
            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });
}

function toggleSelection(index, rowElement) {
    if (selectedRows.includes(index)) {
        selectedRows = selectedRows.filter(i => i !== index);
        rowElement.classList.remove("selected");
    } else {
        selectedRows.push(index);
        rowElement.classList.add("selected");
    }
}

function createBundle() {
    if (selectedRows.length === 0) return alert("Select items to bundle!");

    let bundle = selectedRows.map(index => rawData[index + 1]); // Adjust for header row
    let totalCost = bundle.reduce((sum, row) => sum + parseFloat(row[1] || 0), 0); // Assuming cost is column index 1

    let bundleDiv = document.createElement("div");
    bundleDiv.innerHTML = `<strong>Bundle ${bundles.length + 1}</strong> - Total Cost: $${totalCost.toFixed(2)}`;
    document.getElementById("bundles").appendChild(bundleDiv);

    bundles.push({ items: bundle, totalCost });
    selectedRows = [];
    document.querySelectorAll(".selected").forEach(row => row.classList.remove("selected"));
}
