document.getElementById("fileUpload").addEventListener("change", function(e) {
    handleFile(e.target.files[0]);
});

document.getElementById("drop-zone").addEventListener("click", () => {
    document.getElementById("fileUpload").click();
});

document.getElementById("drop-zone").addEventListener("dragover", (e) => {
    e.preventDefault();
    document.getElementById("drop-zone").classList.add("highlight");
});

document.getElementById("drop-zone").addEventListener("dragleave", () => {
    document.getElementById("drop-zone").classList.remove("highlight");
});

document.getElementById("drop-zone").addEventListener("drop", (e) => {
    e.preventDefault();
    document.getElementById("drop-zone").classList.remove("highlight");
    handleFile(e.dataTransfer.files[0]);
});

function handleFile(file) {
    if (!file) return;
    let reader = new FileReader();
    reader.readAsBinaryString(file);
    reader.onload = function(event) {
        let data = event.target.result;
        let workbook = XLSX.read(data, { type: "binary" });
        let sheet = workbook.Sheets[workbook.SheetNames[0]];
        let rows = XLSX.utils.sheet_to_json(sheet);
        
        processVMData(rows);
    };
}
