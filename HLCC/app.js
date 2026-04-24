const inputs = document.querySelectorAll("input");

inputs.forEach(input => input.addEventListener("input", calculate));

function calculate() {
  const days = +document.getElementById("days").value || 0;
  const people = +document.getElementById("people").value || 1;

  const accom = +document.getElementById("accom").value || 0;
  const food = +document.getElementById("food").value || 0;
  const transport = +document.getElementById("transport").value || 0;
  const activities = +document.getElementById("activities").value || 0;
  const extras = +document.getElementById("extras").value || 0;

  const total = (accom + food + transport + activities + extras) * days;
  const perPerson = total / people;

  document.getElementById("total").innerText = "$" + total.toFixed(2);
  document.getElementById("perPerson").innerText = "$" + perPerson.toFixed(2);
}

function calcFuel() {
  const distance = +document.getElementById("distance").value || 0;
  const consumption = +document.getElementById("consumption").value || 0;
  const fuelPrice = +document.getElementById("fuelPrice").value || 0;

  const litresUsed = (distance / 100) * consumption;
  const cost = litresUsed * fuelPrice;

  document.getElementById("fuelResult").innerText =
    "$" + cost.toFixed(2) + " (" + litresUsed.toFixed(1) + "L)";
}

calculate();
