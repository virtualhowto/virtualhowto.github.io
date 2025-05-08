let rawData = [];
let selectedRows = [];
let bundles = [];

document.getElementById("uploadExcel").addEventListener("change", handleFile);

function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return alert("Please select a valid Excel file.");

    // Show loading spinner
    document.getElementById("loading").classList.remove("hidden");
    document.getElementById("tableContainer").classList.add("hidden");
    document.getElementById("bundleBtn").classList.add("hidden");

    const reader = new FileReader();
    reader.onload = function(e) {
        setTimeout(() => { // Simulate loading delay
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: "array" });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

            console.log("Raw Data:", rawData); // Debugging step
            displayTable();

            // Hide loading spinner and show table
            document.getElementById("loading").classList.add("hidden");
            document.getElementById("tableContainer").classList.remove("hidden");
            document.getElementById("tableContainer").style.opacity = "1";
            document.getElementById("bundleBtn").classList.remove("hidden");
        }, 1500); // Simulated delay for better UX
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
    let headers = Object.keys(rawData[0]); // Extract column names dynamically
    headers.forEach(header => {
        let th = document.createElement("th");
        th.innerText = header;
        tableHeaders.appendChild(th);
    });

    // Populate table rows
    rawData.forEach((row, rowIndex) => {
        let tr = document.createElement("tr");
        tr.setAttribute("data-index", rowIndex);
        tr.onclick = () => toggleSelection(rowIndex, tr);

        headers.forEach(header => {
            let td = document.createElement("td");
            td.innerText = row[header] || ""; // Ensure empty cells are handled
            tr.appendChild(td);
        });

        tableBody.appendChild(tr);
    });

    console.log("Table Rendered Successfully!");
}
