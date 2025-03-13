async function fetchAzurePricing() {
    try {
        const response = await fetch("az-pricing.json"); // Load local JSON file
        const pricingData = await response.json();
        console.log("Azure pricing data loaded successfully:", pricingData);
        return pricingData;
    } catch (error) {
        console.error("Error loading Azure pricing from JSON", error);
        alert("Failed to load Azure pricing. Ensure the JSON file is available.");
        return null;
    }
}

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

async function matchAzureVM(cpu, ramGB, osType) {
    let pricingData = await fetchAzurePricing();
    if (!pricingData) return { vmSize: "Unknown", cost: `$${(0.00 * 720).toFixed(2)}` };

    let filteredPricing = pricingData.filter(vm => vm.name.startsWith("Standard_D")); // Focus only on Standard_D models

    let bestMatch = filteredPricing.reduce((best, vm) => {
        let vmCpu = vm.numberOfCores;
        let vmRam = vm.memoryInMB / 1024; // Convert MB to GB
        let linuxPrice = parseFloat(vm.linuxPrice) || Infinity;
        let windowsPrice = parseFloat(vm.windowsPrice) || Infinity;
        let bestPrice = osType.toLowerCase().includes("windows") ? windowsPrice : linuxPrice;

        if (Math.abs(cpu - vmCpu) <= 2 && Math.abs(ramGB - vmRam) <= 4) {
            return (!best || bestPrice < parseFloat(best.linuxPrice || best.windowsPrice)) ? vm : best;
        }
        return best;
    }, null);

    if (!bestMatch) return { vmSize: "Unknown", cost: `$${(0.00 * 720).toFixed(2)}` };
    
    let pricePerHour = osType.toLowerCase().includes("windows") ? bestMatch.windowsPrice : bestMatch.linuxPrice;
    let monthlyCost = parseFloat(pricePerHour) * 720; // Convert hourly to monthly pricing
    return { vmSize: bestMatch.name, cost: `$${monthlyCost.toFixed(2)}` };
}

async function processVMData(vmData) {
    let tableBody = document.querySelector("#vm-table tbody");
    tableBody.innerHTML = "";
    let azurePricingData = await fetchAzurePricing();
    let standardPricingData = await fetchStandardPricing();
    
    for (let vm of vmData) {
        let cpu = parseInt(vm["CPUs"] || vm["NumCpu"] || 0);
        let ramMB = parseInt(vm["Memory"] || vm["MemoryMB"] || 0);
        let ramGB = (ramMB / 1024).toFixed(2);
        let storageMB = parseFloat(vm["Provisioned MB"] || vm["ProvisionedGB"] || 0);
        let storageGB = (storageMB / 1024).toFixed(2);
        let osType = vm["OS according to the configuration file"] || "Unknown";
        
        let match = await matchAzureVM(cpu, ramGB, osType);
        let standardCost = standardPricingData ? standardPricingData.defaultPrice * cpu : 0; // Example pricing logic
        
        let row = document.createElement("tr");
        row.innerHTML = `
            <td>${vm["VM Name"] || "Unknown"}</td>
            <td>${osType}</td>
            <td>${cpu}</td>
            <td>${ramGB}</td>
            <td>${storageGB}</td>
            <td>
                <select class="azure-vm-select">
                    ${azurePricingData.map(vm => `<option value="${vm.name}" ${vm.name === match.vmSize ? "selected" : ""}>${vm.name}</option>`).join('')}
                </select>
            </td>
            <td class="cost-cell">${match.cost}</td>
            <td class="standard-cost-cell">$${standardCost.toFixed(2)}</td>
        `;
        
        row.addEventListener("click", () => {
            row.classList.toggle("selected");
            updateSummary();
        });
        
        row.querySelector(".azure-vm-select").addEventListener("change", function() {
            let selectedVm = azurePricingData.find(vm => vm.name === this.value);
            if (selectedVm) {
                let pricePerHour = osType.toLowerCase().includes("windows") ? selectedVm.windowsPrice : selectedVm.linuxPrice;
                let monthlyCost = parseFloat(pricePerHour) * 720;
                row.querySelector(".cost-cell").textContent = `$${monthlyCost.toFixed(2)}`;
            }
            updateSummary();
        });
        
        tableBody.appendChild(row);
    }
}

function updateSummary() {
    let summaryTableBody = document.querySelector("#summary-table tbody");
    summaryTableBody.innerHTML = "";
    let totalAzureCost = 0;
    let totalStandardCost = 0;
    
    document.querySelectorAll("#vm-table tbody tr.selected").forEach(row => {
        let clone = row.cloneNode(true);
        summaryTableBody.appendChild(clone);
        let azureCost = parseFloat(row.querySelector(".cost-cell").textContent.replace("$", "")) || 0;
        let standardCost = parseFloat(row.querySelector(".standard-cost-cell").textContent.replace("$", "")) || 0;
        totalAzureCost += azureCost;
        totalStandardCost += standardCost;
    });
    
    document.getElementById("summary-total-azure-cost").textContent = `Azure Total: $${totalAzureCost.toFixed(2)}`;
    document.getElementById("summary-total-standard-cost").textContent = `Standard Total: $${totalStandardCost.toFixed(2)}`;
}
