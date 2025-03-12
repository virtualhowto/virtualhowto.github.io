async function fetchAzurePricing() {
    try {
        let response = await axios.get("https://api.cloudprice.net/v1/prices?currency=AUD&region=australiaeast");
        console.log("Azure pricing data fetched successfully:", response.data);
        return response.data;
    } catch (error) {
        console.error("Error fetching Azure pricing", error);
        alert("Failed to fetch Azure pricing. Check your network connection.");
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
        let cpu = parseInt(vm["CPUs"] || vm["NumCpu"] || 0);
        let ramMB = parseInt(vm["Memory"] || vm["MemoryMB"] || 0);
        let ramGB = (ramMB / 1024).toFixed(2);
        let storageGB = parseFloat(vm["Provisioned MB"] || vm["ProvisionedGB"] || 0).toFixed(2);
        let osType = vm["OS according to the configuration file"] || "Unknown";

        console.log(`Processing VM: CPU=${cpu}, RAM=${ramGB}GB, Storage=${storageGB}GB, OS=${osType}`);
        
        let match = await matchAzureVM(cpu, ramGB);
        console.log("Matched Azure VM:", match);
        
        let row = document.createElement("tr");
        row.innerHTML = `
            <td>${vm["VM Name"] || "Unknown"}</td>
            <td>${osType}</td>
            <td>${cpu}</td>
            <td>${ramGB}</td>
            <td>${storageGB}</td>
            <td>${match.vmSize}</td>
            <td>${match.cost}</td>
        `;
        tableBody.appendChild(row);
    }
}
