async function fetchStandardPricing() {
    try {
        const response = await fetch("pricing.json"); // Load standard pricing JSON file
        const pricingData = await response.json();
        console.log("Standard pricing data loaded successfully:", pricingData);
        return pricingData;
    } catch (error) {
        console.error("Error loading standard pricing from JSON", error);
        alert("Failed to load standard pricing. Ensure the JSON file is available.");
        return null;
    }
}

async function processVMData(vmData) {
    let tableBody = document.querySelector("#vm-table tbody");
    tableBody.innerHTML = "";
    let standardPricingData = await fetchStandardPricing();
    
    for (let vm of vmData) {
        let cpu = parseInt(vm["CPUs"] || vm["NumCpu"] || 0);
        let ramMB = parseInt(vm["Memory"] || vm["MemoryMB"] || 0);
        let ramGB = (ramMB / 1024).toFixed(2);
        let storageMB = parseFloat(vm["Provisioned MB"] || vm["ProvisionedGB"] || 0);
        let storageGB = (storageMB / 1024).toFixed(2);
        let osType = vm["OS according to the configuration file"] || "Unknown";
        
        let standardCost = standardPricingData ? standardPricingData.defaultPrice * cpu : 0; // Example pricing logic
        
        let row = document.createElement("tr");
        row.innerHTML = `
            <td>${vm["VM Name"] || "Unknown"}</td>
            <td>${osType}</td>
            <td>${cpu}</td>
            <td>${ramGB}</td>
            <td>${storageGB}</td>
        `;
        
        row.dataset.standardCost = `$${standardCost.toFixed(2)}`;
        
        row.addEventListener("click", () => {
            row.classList.toggle("selected");
            updateSummary();
        });
        
        tableBody.appendChild(row);
    }
}

function updateSummary() {
    let summaryTableBody = document.querySelector("#summary-table tbody");
    summaryTableBody.innerHTML = "";
    let totalStandardCost = 0;
    
    document.querySelectorAll("#vm-table tbody tr.selected").forEach(row => {
        let clone = row.cloneNode(true);
        summaryTableBody.appendChild(clone);
        let standardCost = parseFloat(row.dataset.standardCost.replace("$", "")) || 0;
        totalStandardCost += standardCost;
    });
    
    document.getElementById("summary-total-standard-cost").textContent = `Standard Total: $${totalStandardCost.toFixed(2)}`;
    document.getElementById("cart-total").textContent = `Cart Total: $${totalStandardCost.toFixed(2)}`;
}
