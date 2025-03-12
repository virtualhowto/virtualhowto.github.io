async function fetchAzurePricing() {
    try {
        let response = await axios.get("https://api.cloudprice.net/v1/prices?currency=AUD&region=australiaeast");
        return response.data;
    } catch (error) {
        console.error("Error fetching Azure pricing", error);
        return null;
    }
}

async function matchAzureVM(cpu, ram) {
    let pricingData = await fetchAzurePricing();
    if (!pricingData) return { vmSize: "Unknown", cost: "N/A" };

    let bestMatch = pricingData.vms.reduce((best, vm) => {
        let vmCpu = vm.cpu;
        let vmRam = vm.memory_gb;
        if (Math.abs(cpu - vmCpu) <= 2 && Math.abs(ram - vmRam) <= 4) {
            return (!best || vm.price_monthly < best.price_monthly) ? vm : best;
        }
        return best;
    }, null);

    return bestMatch ? { vmSize: bestMatch.name, cost: `$${bestMatch.price_monthly.toFixed(2)}` } : { vmSize: "Unknown", cost: "N/A" };
}

async function processVMData(vmData) {
    let tableBody = document.querySelector("#vm-table tbody");
    tableBody.innerHTML = "";
    
    for (let vm of vmData) {
        let cpu = vm["NumCpu"] || 0;
        let ram = (vm["MemoryMB"] || 0) / 1024;
        let match = await matchAzureVM(cpu, ram);
        let row = `<tr>
            <td>${vm["VM Name"] || "Unknown"}</td>
            <td>${vm["OS according to the configuration file"] || "Unknown"}</td>
            <td>${cpu}</td>
            <td>${ram.toFixed(2)}</td>
            <td>${(vm["ProvisionedGB"] || 0).toFixed(2)}</td>
            <td>${match.vmSize}</td>
            <td>${match.cost}</td>
        </tr>`;
        tableBody.innerHTML += row;
    }
}
