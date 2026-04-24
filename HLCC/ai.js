function generateTrip() {
  const destination = document.getElementById("destination").value.toLowerCase();
  const style = document.getElementById("style").value;

  let data = getPreset(destination, style);

  // Auto-fill costs
  document.getElementById("accom").value = data.accom;
  document.getElementById("food").value = data.food;
  document.getElementById("transport").value = data.transport;
  document.getElementById("activities").value = data.activities;
  document.getElementById("extras").value = data.extras;

  document.getElementById("planOutput").innerText = data.plan;

  calculate();
}

// Smart presets (expand this over time)
function getPreset(dest, style) {

  const presets = {
    bali: {
      budget: {
        accom: 40, food: 20, transport: 10, activities: 15, extras: 10,
        plan: "🏝️ Bali Budget:\n- Warungs for food\n- Scooter rental\n- Beaches & temples"
      },
      mid: {
        accom: 100, food: 40, transport: 20, activities: 30, extras: 20,
        plan: "🌴 Bali Mid:\n- Villas or resorts\n- Day tours\n- Beach clubs"
      },
      luxury: {
        accom: 300, food: 100, transport: 50, activities: 80, extras: 50,
        plan: "💎 Bali Luxury:\n- Private villa\n- Driver\n- Fine dining + spa"
      }
    },

    japan: {
      budget: {
        accom: 80, food: 30, transport: 20, activities: 20, extras: 15,
        plan: "🇯🇵 Japan Budget:\n- Capsule hotels\n- Convenience store meals\n- Trains"
      },
      mid: {
        accom: 150, food: 60, transport: 40, activities: 40, extras: 30,
        plan: "🍣 Japan Mid:\n- Business hotels\n- JR pass\n- Attractions"
      },
      luxury: {
        accom: 400, food: 150, transport: 80, activities: 100, extras: 80,
        plan: "🏯 Japan Luxury:\n- Ryokan stays\n- Private tours\n- Fine dining"
      }
    }
  };

  return (presets[dest] && presets[dest][style]) ||
    {
      accom: 120,
      food: 50,
      transport: 30,
      activities: 40,
      extras: 25,
      plan: "🌍 Generic Plan:\n- Explore local highlights\n- Mix of dining + attractions"
    };
}
