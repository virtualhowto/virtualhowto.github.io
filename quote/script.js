let rawData = [];
let selectedRows = [];
let bundles = [];

document.getElementById("uploadExcel").addEventListener("change", handleFile);

function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return alert("Please select a valid Excel file.");

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        console.log("Raw Data:", rawData);
        displayTable();
    };
    reader.readAsArrayBuffer(file);
}

function displayTable() {
    let tableHeaders = document.getElementById("tableHeaders");
    let tableBody = document.getElementById("tableBody");
    tableHeaders.innerHTML = "";
    tableBody.innerHTML = "";

    if (!rawData.length) {
        alert("No data found in the file.");
        return;
    }

    // Set headers
    let headers = rawData[0];
    headers.forEach(header => {
        let th = document.createElement("th");
        th.innerText = header;
        tableHeaders.appendChild(th);
    });

    // Populate table rows
    rawData.slice(1).forEach((row, rowIndex) => {
        let tr = document.createElement("tr");
        tr.setAttribute("data-index", rowIndex);
        tr.onclick = () => toggleSelection(rowIndex, tr);

        row.forEach(cell => {
            let td = document.createElement("td");
            td.innerText = cell || "";
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

    let costColumnIndex = rawData[0].indexOf("Cost"); // Adjust based on header name
    if (costColumnIndex === -1) return alert("Cost column not found!");

    let bundle = selectedRows.map(index => rawData[index + 1]); // Adjust for header row
    let totalCost = bundle.reduce((sum, row) => sum + parseFloat(row[costColumnIndex] || 0), 0);

    let bundleDiv = document.createElement("div");
    bundleDiv.innerHTML = `<strong>Bundle ${bundles.length + 1}</strong> - Total Cost: $${totalCost.toFixed(2)}`;
    document.getElementById("bundles").appendChild(bundleDiv);

    bundles.push({ items: bundle, totalCost });
    selectedRows = [];
    document.querySelectorAll(".selected").forEach(row => row.classList.remove("selected"));
}
