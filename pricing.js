async function fetchAzurePricing() {
    try {
        const response = await fetch("azure-pricing.json");
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
        const response = await fetch("pricing.json");
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
    const pricingData = await fetchAzurePricing();
    if (!pricingData) return { vmSize: "Unknown", cost: `$0.00` };

    const filteredPricing = pricingData.filter(vm =>
        vm.name.startsWith("Standard_D")
    );

    const bestMatch = filteredPricing.reduce((best, vm) => {
        const vmCpu = vm.numberOfCores;
        const vmRamGB = vm.memoryInMB / 1024;
        const price = osType.toLowerCase().includes("windows") ? parseFloat(vm.windowsPrice) : parseFloat(vm.linuxPrice);

        if (!price || isNaN(price)) return best;

        const withinTolerance = Math.abs(cpu - vmCpu) <= 2 && Math.abs(ramGB - vmRamGB) <= 4;

        if (withinTolerance && (!best || price < (osType.toLowerCase().includes("windows") ? parseFloat(best.windowsPrice) : parseFloat(best.linuxPrice)))) {
            return vm;
        }

        return best;
    }, null);

    if (!bestMatch) return { vmSize: "Unknown", cost: `$0.00` };

    const matchedPrice = osType.toLowerCase().includes("windows") ? parseFloat(bestMatch.windowsPrice) : parseFloat(bestMatch.linuxPrice);
    const monthlyCost = matchedPrice * 720;

    return {
        vmSize: bestMatch.name,
        cost: `$${monthlyCost.toFixed(2)}`,
        bestRegion: bestMatch.bestPriceRegion
    };
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
        let provisionedMiB = parseFloat(vm["Provisioned MiB"] || 0);
        let usedMiB = parseFloat(vm["In Use MiB"] || 0);
        let storageGB = (provisionedMiB / 1024).toFixed(2);
        let usedStorageGB = (usedMiB / 1024).toFixed(2);
        let osType = vm["OS according to the configuration file"] || "Unknown";
        let vmName = vm["VM"] || vm["VM Name"] || "Unknown";

        let match = await matchAzureVM(cpu, ramGB, osType);
        let standardCost = standardPricingData ? standardPricingData.defaultPrice * cpu : 0;

        let row = document.createElement("tr");
        row.innerHTML = `
            <td>${vmName}</td>
            <td>${osType}</td>
            <td>${cpu}</td>
            <td>${ramGB}</td>
            <td>${storageGB}</td>
            <td>${usedStorageGB}</td>
            <td>
                <select class="azure-vm-select">
                    ${azurePricingData.map(vm => `<option value="${vm.name}" ${vm.name === match.vmSize ? "selected" : ""}>${vm.name}</option>`).join('')}
                </select>
            </td>
        `;

        row.dataset.azureCost = match.cost;
        row.dataset.standardCost = `$${standardCost.toFixed(2)}`;

        row.addEventListener("click", () => {
            row.classList.toggle("selected");
            updateSummary();
        });

        row.querySelector(".azure-vm-select").addEventListener("change", function() {
            let selectedVm = azurePricingData.find(vm => vm.name === this.value);
            if (selectedVm) {
                let pricePerHour = osType.toLowerCase().includes("windows") ? selectedVm.windowsPrice : selectedVm.linuxPrice;
                let monthlyCost = parseFloat(pricePerHour) * 720;
                row.dataset.azureCost = `$${monthlyCost.toFixed(2)}`;
            }
            updateSummary();
        });

        tableBody.appendChild(row);
    }

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "Export Selected to CSV";
    exportBtn.onclick = exportCSV;
    document.querySelector(".summary").appendChild(exportBtn);
}

function updateSummary() {
    let summaryTableBody = document.querySelector("#summary-table tbody");
    summaryTableBody.innerHTML = "";
    let totalAzureCost = 0;
    let totalStandardCost = 0;

    document.querySelectorAll("#vm-table tbody tr.selected").forEach(row => {
        let clone = row.cloneNode(true);
        summaryTableBody.appendChild(clone);
        let azureCost = parseFloat(row.dataset.azureCost.replace("$", "")) || 0;
        let standardCost = parseFloat(row.dataset.standardCost.replace("$", "")) || 0;
        totalAzureCost += azureCost;
        totalStandardCost += standardCost;
    });

    document.getElementById("summary-total-azure-cost").textContent = `Azure Total: $${totalAzureCost.toFixed(2)}`;
    document.getElementById("summary-total-standard-cost").textContent = `Standard Total: $${totalStandardCost.toFixed(2)}`;
    document.getElementById("cart-total").textContent = `Cart Total: $${totalStandardCost.toFixed(2)}`;
}

function exportCSV() {
    const selectedRows = document.querySelectorAll("#vm-table tbody tr.selected");
    if (!selectedRows.length) return alert("No VMs selected.");

    let csv = "VM Name,OS,CPU,RAM (GB),Storage (GB),Used Storage (GB),Azure VM,Azure Cost\n";
    selectedRows.forEach(row => {
        const cells = row.querySelectorAll("td");
        const vmName = cells[0].textContent;
        const os = cells[1].textContent;
        const cpu = cells[2].textContent;
        const ram = cells[3].textContent;
        const storage = cells[4].textContent;
        const usedStorage = cells[5].textContent;
        const azureVM = row.querySelector(".azure-vm-select").value;
        const cost = row.dataset.azureCost;
        csv += `${vmName},${os},${cpu},${ram},${storage},${usedStorage},${azureVM},${cost}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "selected_vms.csv";
    link.click();
}
