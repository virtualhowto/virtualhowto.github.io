document.addEventListener("DOMContentLoaded", () => {
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("fileUpload");
    
    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("highlight");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("highlight");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("highlight");
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });
});

function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.readAsBinaryString(file);
    reader.onload = function(event) {
        const data = event.target.result;
        try {
            const workbook = XLSX.read(data, { type: "binary" });
            const sheetName = workbook.SheetNames.find(name => name.toLowerCase().includes("vinfo")) || workbook.SheetNames[0];
            const vInfo = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
            
            if (!vInfo || vInfo.length === 0) {
                alert("Invalid RVTools file. No data found.");
                return;
            }
            
            processVMData(vInfo);
        } catch (error) {
            console.error("Error processing file", error);
            alert("Error reading file. Ensure it's a valid RVTools export.");
        }
    };
}
