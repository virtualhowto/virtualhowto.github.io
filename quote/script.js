let rawData = [];
let selectedRows = [];
let bundles = JSON.parse(localStorage.getItem("bundles")) || [];

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

            displayTable();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("tableContainer").classList.remove("hidden");
            document.getElementById("bundleBtn").classList.remove("hidden");
        }, 1500);
    };
    reader.readAsArrayBuffer(file);
}

function createBundle() {
    if (selectedRows.length === 0) return alert("Select items to bundle!");
    let bundleName = prompt("Enter a name for this bundle:");
    if (!bundleName) return;

    let bundleType = confirm("Click OK for MRR (Monthly Recurring Revenue), Cancel for CapEx (Capital Expenditure)")
        ? "MRR"
        : "CapEx";

    let contractTerm = bundleType === "MRR" ? prompt("Enter contract term in months (e.g., 12, 24, 36):") : null;
    let interestRate = bundleType === "MRR" ? prompt("Enter annual interest rate (e.g., 5 for 5%):") : null;

    let bundle = { name: bundleName, type: bundleType, term: contractTerm, interest: interestRate, items: selectedRows };
    bundles.push(bundle);
    localStorage.setItem("bundles", JSON.stringify(bundles));

    displayBundles();
}

function displayBundles() {
    let bundleContainer = document.getElementById("bundles");
    bundleContainer.innerHTML = "";

    bundles.forEach((bundle, index) => {
        let bundleDiv = document.createElement("div");
        bundleDiv.innerHTML = `<strong>${bundle.name} (${bundle.type})</strong> - ${bundle.items.length} items selected
                               <button onclick="editBundle(${index})">Edit</button>
                               <button onclick="deleteBundle(${index})">Delete</button>`;
        bundleContainer.appendChild(bundleDiv);
    });
}

function deleteBundle(index) {
    bundles.splice(index, 1);
    localStorage.setItem("bundles", JSON.stringify(bundles));
    displayBundles();
}
