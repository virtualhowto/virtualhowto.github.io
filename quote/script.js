let rawData = [];
let selectedRows = [];
let bundles = [];

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

            console.log("Raw Data:", rawData);
            displayTable();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("tableContainer").classList.remove("hidden");
            document.getElementById("bundleBtn").classList.remove("hidden");
        }, 1500);
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

function toggleSelection(index, rowElement) {
    rowElement.classList.toggle("selected");
    selectedRows.includes(index) ? selectedRows.splice(selectedRows.indexOf(index), 1) : selectedRows.push(index);
}

function createBundle() {
    if (selectedRows.length === 0) return alert("Select items to bundle!");
    let bundleName = prompt("Enter a name for this bundle:");
    if (!bundleName) return;

    let bundleType = confirm("Click OK for MRR (Monthly Recurring Revenue), Cancel for CapEx (Capital Expenditure)")
        ? "MRR"
        : "CapEx";

    let costColumnIndex = rawData[0].indexOf("Cost");
    if (costColumnIndex === -1) return alert("Cost column not found!");

    let bundleItems = selectedRows.map(index => rawData[index + 1]);
    let totalCost = bundleItems.reduce((sum, row) => sum + parseFloat(row[costColumnIndex] || 0), 0);

    let bundleDiv = document.createElement("div");

    if (bundleType === "MRR") {
        let contractTerm = prompt("Enter contract term in months (e.g., 12, 24, 36):");
        if (!contractTerm || isNaN(contractTerm) || contractTerm <= 0) return alert("Invalid contract term!");

        let monthlyPrice = (totalCost / contractTerm).toFixed(2);
        let totalContractValue = (monthlyPrice * contractTerm).toFixed(2);

        bundleDiv.innerHTML = `<strong>${bundleName} (${bundleType})</strong> - ${selectedRows.length} items selected<br>
                               Total Cost: $${totalCost.toFixed(2)}<br>
                               Monthly Price: $${monthlyPrice}<br>
                               Total Contract Value: $${totalContractValue}`;
    } else {
        bundleDiv.innerHTML = `<strong>${bundleName} (${bundleType})</strong> - ${selectedRows.length} items selected<br>
                               Total Cost: $${totalCost.toFixed(2)}`;
    }

    document.getElementById("bundles").appendChild(bundleDiv);

    selectedRows = [];
    document.querySelectorAll(".selected").forEach(row => row.classList.remove("selected"));
}
