const geoserverUrl = "https://seu-geoserver-url/geoserver";
const wfsUrl = `${geoserverUrl}/wfs`;
const wmsUrl = `${geoserverUrl}/wms`;

const layers = {
  estados: "workspace:estados", // Substitua 'workspace' pelo seu workspace e 'estados' pelo nome da camada
  municipios: "workspace:municipios",
  propriedades: "workspace:propriedades",
  assentamentos: "workspace:assentamentos",
  quilombos: "workspace:quilombos",
};

// Inicializa o Mapa
const map = L.map("map").setView([-15.7801, -47.9292], 4); // Coordenadas centrais do Brasil

// Adiciona camada base
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

//Adiciona Camadas do GeoServer

async function getWFSData(typeName, cqlFilter = "") {
  let url = `${wfsUrl}?service=WFS&version=1.0.0&request=GetFeature&typeName=${typeName}&outputFormat=application/json`;

  if (cqlFilter) {
    url += `&CQL_FILTER=${encodeURIComponent(cqlFilter)}`;
  }

  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error("Erro ao buscar dados WFS:", error);
  }
}

//Adciona Camadas ao Mapa

async function addWFSLayer(typeName, styleFunction) {
  const data = await getWFSData(typeName);
  L.geoJSON(data, {
    style: styleFunction,
    onEachFeature: onEachFeature,
  }).addTo(map);
}

//Adiciona Camadas Específicas

// Adiciona a camada de estados
addWFSLayer(layers.estados, function (feature) {
  return { color: "#0000FF", weight: 1 };
});

// Adiciona a camada de propriedades rurais
addWFSLayer(layers.propriedades, getPropertyStyle);

//Aplica Estilo para Propriedades
function getPropertyStyle(feature) {
  let color;
  switch (feature.properties.tipo_propriedade) {
    case "Minifúndio":
      color = "green";
      break;
    case "Mesofúndio":
      color = "orange";
      break;
    case "Latifúndio":
      color = "red";
      break;
    default:
      color = "gray";
  }
  return { color: color, weight: 1 };
}

//Manipula Eventos em Cada Propriedade

function onEachFeature(feature, layer) {
  if (feature.properties) {
    const popupContent = `
        <strong>${feature.properties.nome}</strong><br/>
        Tipo: ${feature.properties.tipo_propriedade}<br/>
        Cultura: ${feature.properties.cultura}<br/>
        Volume de Produção: ${feature.properties.volume_producao}
      `;
    layer.bindPopup(popupContent);
  }
}

//Insere dados nos filtros
async function loadEstados() {
  const data = await getWFSData(layers.estados);
  const selectEstado = document.getElementById("selectEstado");

  data.features.forEach((feature) => {
    const option = document.createElement("option");
    option.value = feature.properties.nome;
    option.text = feature.properties.nome;
    selectEstado.add(option);
  });
}

async function loadMunicipios(estado) {
  const selectMunicipio = document.getElementById("selectMunicipio");
  selectMunicipio.innerHTML = '<option value="">Todos</option>';

  const cqlFilter = estado ? `nome_estado='${estado}'` : "";
  const data = await getWFSData(layers.municipios, cqlFilter);

  data.features.forEach((feature) => {
    const option = document.createElement("option");
    option.value = feature.properties.nome;
    option.text = feature.properties.nome;
    selectMunicipio.add(option);
  });
}

// Carrega os estados ao iniciar
loadEstados();

//Monitora eventos dos filtros
document.getElementById("selectEstado").addEventListener("change", function () {
  const estado = this.value;
  loadMunicipios(estado);
  updateMap({ estado });
});

document
  .getElementById("selectMunicipio")
  .addEventListener("change", function () {
    const municipio = this.value;
    const estado = document.getElementById("selectEstado").value;
    updateMap({ estado, municipio });
  });

//Atualiza o Mapa com os filtros aplicados

async function updateMap(filters) {
  let cqlFilter = "";
  if (filters.estado) {
    cqlFilter += `nome_estado='${filters.estado}'`;
  }
  if (filters.municipio) {
    if (cqlFilter) cqlFilter += " AND ";
    cqlFilter += `nome_municipio='${filters.municipio}'`;
  }

  // Remove a camada anterior de propriedades
  if (propriedadesLayer) {
    map.removeLayer(propriedadesLayer);
  }

  // Adiciona a nova camada filtrada
  const data = await getWFSData(layers.propriedades, cqlFilter);
  propriedadesLayer = L.geoJSON(data, {
    style: getPropertyStyle,
    onEachFeature: onEachFeature,
  }).addTo(map);

  // Atualiza os totalizadores e gráficos
  const processedData = processarDados(data);
  atualizarTotalizadores(processedData);
  criarGraficos(processedData);
}

//Processa dados para gráfico

function processarDados(data) {
  const totalPropriedades = data.features.length;
  const tiposPropriedade = {};
  const culturas = {};
  let totalProducao = 0;

  data.features.forEach((feature) => {
    const tipo = feature.properties.tipo_propriedade;
    const cultura = feature.properties.cultura;
    const producao = feature.properties.volume_producao || 0;

    // Conta por tipo de propriedade
    tiposPropriedade[tipo] = (tiposPropriedade[tipo] || 0) + 1;

    // Conta por cultura
    if (cultura) {
      culturas[cultura] = (culturas[cultura] || 0) + 1;
    }

    // Soma do volume de produção
    totalProducao += producao;
  });

  return {
    totalPropriedades,
    tiposPropriedade,
    culturas,
    totalProducao,
  };
}

//Atualiza totalizações
function atualizarTotalizadores(dados) {
  document.getElementById("totalPropriedades").textContent =
    dados.totalPropriedades;
}

//Cria gráfico de Barras para Culturas Produzidas

function criarGraficoBarra(dados) {
  // Limpa o gráfico anterior
  d3.select("#grafico-barra").html("");

  const data = Object.entries(dados.culturas).map(([cultura, valor]) => ({
    cultura,
    valor,
  }));

  const svgWidth = 400,
    svgHeight = 300;
  const margin = { top: 20, right: 20, bottom: 70, left: 50 };
  const width = svgWidth - margin.left - margin.right;
  const height = svgHeight - margin.top - margin.bottom;

  const svg = d3
    .select("#grafico-barra")
    .append("svg")
    .attr("width", svgWidth)
    .attr("height", svgHeight)
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  const x = d3
    .scaleBand()
    .range([0, width])
    .domain(data.map((d) => d.cultura))
    .padding(0.1);

  const y = d3
    .scaleLinear()
    .range([height, 0])
    .domain([0, d3.max(data, (d) => d.valor)]);

  svg
    .selectAll(".bar")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", (d) => x(d.cultura))
    .attr("width", x.bandwidth())
    .attr("y", (d) => y(d.valor))
    .attr("height", (d) => height - y(d.valor))
    .attr("fill", "steelblue");

  svg
    .append("g")
    .attr("transform", `translate(0, ${height})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

  svg.append("g").call(d3.axisLeft(y));
}

//Cria gráfico Pizza para Tipos de Propriedades

function criarGraficoPizza(dados) {
  // Limpa o gráfico anterior
  d3.select("#grafico-pizza").html("");

  const data = Object.entries(dados.tiposPropriedade).map(([tipo, valor]) => ({
    tipo,
    valor,
  }));

  const width = 400,
    height = 300,
    radius = Math.min(width, height) / 2;

  const svg = d3
    .select("#grafico-pizza")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${width / 2}, ${height / 2})`);

  const color = d3.scaleOrdinal(d3.schemeCategory10);

  const pie = d3.pie().value((d) => d.valor);
  const data_ready = pie(data);

  const arc = d3.arc().innerRadius(0).outerRadius(radius);

  svg
    .selectAll("slices")
    .data(data_ready)
    .enter()
    .append("path")
    .attr("d", arc)
    .attr("fill", (d) => color(d.data.tipo))
    .style("stroke", "white")
    .style("stroke-width", "2px");

  svg
    .selectAll("labels")
    .data(data_ready)
    .enter()
    .append("text")
    .text((d) => d.data.tipo)
    .attr("transform", (d) => `translate(${arc.centroid(d)})`)
    .style("text-anchor", "middle")
    .style("font-size", 12);
}

// Mostra gráficos com dados
function criarGraficos(dados) {
  criarGraficoBarra(dados);
  criarGraficoPizza(dados);
}
