const presets = {
  "wood-water": {
    objectDensity: 0.72,
    liquidDensity: 1.0,
    volume: 2.4,
  },
  "plastic-brine": {
    objectDensity: 0.96,
    liquidDensity: 1.16,
    volume: 2.0,
  },
  "stone-water": {
    objectDensity: 2.45,
    liquidDensity: 1.0,
    volume: 1.6,
  },
  "neutral-fluid": {
    objectDensity: 1.03,
    liquidDensity: 1.04,
    volume: 2.8,
  },
};

const controls = {
  objectDensity: document.getElementById("objectDensity"),
  liquidDensity: document.getElementById("liquidDensity"),
  volume: document.getElementById("volume"),
};

const outputs = {
  objectDensity: document.getElementById("objectDensityValue"),
  liquidDensity: document.getElementById("liquidDensityValue"),
  volume: document.getElementById("volumeValue"),
  weight: document.getElementById("weightValue"),
  maxBuoyancy: document.getElementById("maxBuoyancyValue"),
  actualBuoyancy: document.getElementById("actualBuoyancyValue"),
  netForce: document.getElementById("netForceValue"),
  submerged: document.getElementById("submergedValue"),
  displacedMass: document.getElementById("displacedMassValue"),
  phenomenon: document.getElementById("phenomenonText"),
  summary: document.getElementById("statusSummary"),
};

const stateBadge = document.getElementById("stateBadge");
const objectBlock = document.getElementById("objectBlock");
const buoyancyArrow = document.getElementById("buoyancyArrow");
const gravityArrow = document.getElementById("gravityArrow");
const tankShell = document.getElementById("tankShell");
const waterFill = document.getElementById("waterFill");
const rerunButton = document.getElementById("rerunButton");
const presetButtons = Array.from(document.querySelectorAll(".preset-button"));

const G = 9.8;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value, fractionDigits = 2) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function interpolateChannel(start, end, ratio) {
  return Math.round(start + (end - start) * ratio);
}

function colorForObjectDensity(density) {
  const ratio = clamp((density - 0.2) / 2.8, 0, 1);
  const r = interpolateChannel(218, 96, ratio);
  const g = interpolateChannel(167, 101, ratio);
  const b = interpolateChannel(96, 126, ratio);
  return {
    front: `rgb(${r}, ${g}, ${b})`,
    edge: `rgb(${clamp(r - 42, 0, 255)}, ${clamp(g - 46, 0, 255)}, ${clamp(b - 40, 0, 255)})`,
  };
}

function setPreset(name) {
  const preset = presets[name];
  if (!preset) {
    return;
  }

  controls.objectDensity.value = preset.objectDensity.toFixed(2);
  controls.liquidDensity.value = preset.liquidDensity.toFixed(2);
  controls.volume.value = preset.volume.toFixed(1);

  presetButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.preset === name);
  });

  updateSimulation();
}

function rerunAnimation() {
  tankShell.classList.remove("is-rerunning");
  objectBlock.classList.remove("is-kicked");

  void tankShell.offsetWidth;

  tankShell.classList.add("is-rerunning");
  objectBlock.classList.add("is-kicked");

  window.setTimeout(() => {
    tankShell.classList.remove("is-rerunning");
    objectBlock.classList.remove("is-kicked");
  }, 900);
}

function updateSimulation() {
  const objectDensity = Number.parseFloat(controls.objectDensity.value);
  const liquidDensity = Number.parseFloat(controls.liquidDensity.value);
  const volume = Number.parseFloat(controls.volume.value);

  const objectMass = objectDensity * volume;
  const fullDisplacedMass = liquidDensity * volume;
  const weight = objectMass * G;
  const maxBuoyancy = fullDisplacedMass * G;

  let state = "floating";
  let stateLabel = "漂浮";
  let submergedRatio = clamp(objectDensity / liquidDensity, 0.12, 1);
  let actualBuoyancy = weight;
  let netForce = 0;

  if (Math.abs(objectDensity - liquidDensity) <= 0.03) {
    state = "neutral";
    stateLabel = "悬浮";
    submergedRatio = 1;
    actualBuoyancy = weight;
    netForce = 0;
  } else if (objectDensity > liquidDensity) {
    state = "sinking";
    stateLabel = "下沉";
    submergedRatio = 1;
    actualBuoyancy = maxBuoyancy;
    netForce = weight - maxBuoyancy;
  }

  const displacedMass = liquidDensity * volume * submergedRatio;
  const side = clamp(72 + volume * 10.5, 72, 136);
  const waterTop = 118;
  const tankBottom = 478;

  let top = waterTop - side * (1 - submergedRatio) - 2;
  if (state === "neutral") {
    top = waterTop + 122;
  }
  if (state === "sinking") {
    top = tankBottom - side;
  }

  objectBlock.style.width = `${side}px`;
  objectBlock.style.height = `${side}px`;
  objectBlock.style.top = `${top}px`;
  objectBlock.classList.remove("floating", "neutral", "sinking");
  objectBlock.classList.add(state);

  const objectColor = colorForObjectDensity(objectDensity);
  document.documentElement.style.setProperty(
    "--object-front",
    objectColor.front,
  );
  document.documentElement.style.setProperty("--object-edge", objectColor.edge);

  const waterTintShift = clamp((liquidDensity - 1) / 0.4, -0.6, 1);
  const waterMidAlpha = clamp(0.6 + waterTintShift * 0.12, 0.52, 0.82);
  const waterDeepAlpha = clamp(0.78 + waterTintShift * 0.08, 0.7, 0.95);
  waterFill.style.background = `linear-gradient(180deg,
      rgba(170, 233, 242, 0.56) 0%,
      rgba(74, 177, 213, ${waterMidAlpha}) 48%,
      rgba(19, 104, 151, ${waterDeepAlpha}) 100%)`;

  const referenceForce = Math.max(weight, maxBuoyancy, 1);
  const buoyancyHeight = 58 + (actualBuoyancy / referenceForce) * 80;
  const gravityHeight = 58 + (weight / referenceForce) * 80;
  const centerY = top + side / 2;

  buoyancyArrow.style.height = `${buoyancyHeight}px`;
  buoyancyArrow.style.top = `${centerY - buoyancyHeight}px`;

  gravityArrow.style.height = `${gravityHeight}px`;
  gravityArrow.style.top = `${centerY}px`;

  stateBadge.dataset.state = state;
  stateBadge.textContent = stateLabel;

  outputs.objectDensity.textContent = `${formatNumber(objectDensity, 2)} g/cm^3`;
  outputs.liquidDensity.textContent = `${formatNumber(liquidDensity, 2)} g/cm^3`;
  outputs.volume.textContent = `${formatNumber(volume, 2)} L`;
  outputs.weight.textContent = `${formatNumber(weight, 2)} N`;
  outputs.maxBuoyancy.textContent = `${formatNumber(maxBuoyancy, 2)} N`;
  outputs.actualBuoyancy.textContent = `${formatNumber(actualBuoyancy, 2)} N`;
  outputs.netForce.textContent = `${formatNumber(netForce, 2)} N`;
  outputs.submerged.textContent = `${formatNumber(submergedRatio * 100, 0)}%`;
  outputs.displacedMass.textContent = `${formatNumber(displacedMass, 2)} kg`;

  let summary = "";
  let phenomenon = "";

  if (state === "floating") {
    summary = "物体密度小于液体密度，试块漂浮。";
    phenomenon =
      `当前物体密度为 ${formatNumber(objectDensity, 2)} g/cm^3，小于液体密度 ${formatNumber(liquidDensity, 2)} g/cm^3。` +
      `试块只需浸没约 ${formatNumber(submergedRatio * 100, 0)}% 的体积，就能让浮力与重力平衡，因此会停在液面附近。`;
  } else if (state === "neutral") {
    summary = "物体与液体密度接近，试块接近悬浮。";
    phenomenon =
      `物体密度与液体密度非常接近，单位体积所受重力和单位体积可获得的浮力近似相等。` +
      "因此试块会整体浸没在液体中，并在中间区域缓慢稳定下来。";
  } else {
    summary = "物体密度大于液体密度，试块下沉。";
    phenomenon =
      `当前最大浮力约为 ${formatNumber(maxBuoyancy, 2)} N，小于重力 ${formatNumber(weight, 2)} N。` +
      `浮力不足以抵消重力，试块会继续向下运动并沉到底部，剩余向下净力约为 ${formatNumber(netForce, 2)} N。`;
  }

  outputs.summary.textContent = summary;
  outputs.phenomenon.textContent = phenomenon;
}

presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setPreset(button.dataset.preset);
    rerunAnimation();
  });
});

Object.values(controls).forEach((control) => {
  control.addEventListener("input", () => {
    presetButtons.forEach((button) => button.classList.remove("is-active"));
    updateSimulation();
  });
});

rerunButton.addEventListener("click", rerunAnimation);

updateSimulation();
