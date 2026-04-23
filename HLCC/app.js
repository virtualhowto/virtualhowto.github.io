const inputs = document.querySelectorAll("input, select");

inputs.forEach(input => {
  input.addEventListener("input", calculate);
});

function calculate() {
  const days = parseFloat(document.getElementById("days").value) || 0;
  const people = parseFloat(document.getElementById("people").value) || 1;

  const accom = parseFloat(document.getElementById("accom").value) || 0;
  const food = parseFloat(document.getElementById("food").value) || 0;
  const transport = parseFloat(document.getElementById("transport").value) || 0;
  const activities = parseFloat(document.getElementById("activities").value) || 0;
  const extras = parseFloat(document.getElementById("extras").value) || 0;

  const currency = document.getElementById("currency").value;

  const dailyTotal = accom + food + transport + activities + extras;
  const total = dailyTotal * days;
  const perPerson = total / people;

  document.getElementById("total").innerText = currency + total.toFixed(2);
  document.getElementById("perPerson").innerText = currency + perPerson.toFixed(2);
}

calculate();
