let rawData = [];
let selectedRows = [];
let bundles = JSON.parse(localStorage.getItem("bundles")) || [];
let headerRowIndex = 0; // Default header row index

document.getElementById("uploadExcel").addEventListener("change", handleFile);

function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return alert("Please select a valid Excel file.");

    document.getElementById("loading").classList.remove("hidden");
    document.getElementById("tableContainer").classList.add("hidden");
    document.getElementById("bundleBtn").classList.add("hidden");

    const reader = new FileReader();
    reader.onload = function(e) {
        setTimeout(() => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: "array" });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

            // Remove blank rows
            rawData = rawData.filter(row => Object.values(row).some(value => value !== "" && value !== null));

            displayHeaderSelection();
            displayTable();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("tableContainer").classList.remove("hidden");
            document.getElementById("bundleBtn").classList.remove("hidden");
        }, 1500);
    };
    reader.readAsArrayBuffer(file);
}

function displayHeaderSelection() {
    let headerDiv = document.getElementById("headerSelection");
    headerDiv.innerHTML = "<h3>Select Header Row</h3>";

    rawData.forEach((row, index) => {
        let button = document.createElement("button");
        button.className = "btn";
        button.innerText = `Row ${index + 1}`;
        button.onclick = () => setHeader(index);
        headerDiv.appendChild(button);
    });
}

function setHeader(index) {
    headerRowIndex = index;
    setHeaderRow();
}

function setHeaderRow() {
    rawData = rawData.slice(headerRowIndex); // Discard rows above selected header
    displayTable();
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

    let headers = Object.keys(rawData[0]);
    headers.forEach(header => {
        let th = document.createElement("th");
        th.innerText = header;
        tableHeaders.appendChild(th);
    });

    rawData.forEach((row, rowIndex) => {
        let tr = document.createElement("tr");
        tr.setAttribute("data-index", rowIndex);
        tr.onclick = () => toggleSelection(rowIndex, tr);

        headers.forEach(header => {
            let td = document.createElement("td");
            td.innerText = row[header] || "";
            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });
}
