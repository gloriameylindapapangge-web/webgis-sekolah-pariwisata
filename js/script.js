/* ==========================================================
   WebGIS Sekolah dan Pariwisata - Leaflet.js
   ========================================================== */

// ---------- Konfigurasi (sesuaikan dengan wilayah kelompok) ----------
const CONFIG = {
    center: [0.7357, 124.3130], // pusat peta awal (Kota Kotamobagu)
    zoom: 13,
    dataUrl: "data/sekolah_pariwisata.geojson",
    boundaryKabupatenUrl: "data/batas_kabupaten.geojson",
    boundaryKecamatanUrl: "data/batas_kecamatan.geojson",
    fieldKategori: "Kategori"
};

// Data memakai Kategori "Pendidikan"; di aplikasi ditampilkan sebagai "Sekolah"
function normalizeCategory(raw) {
    if (raw === "Pendidikan" || raw === "Sekolah") return "Sekolah";
    return raw;
}

// Ambil nilai dari beberapa kemungkinan nama field
function pick(p, ...keys) {
    for (const k of keys) {
        if (p[k] !== undefined && p[k] !== null && String(p[k]).trim() !== "") return p[k];
    }
    return null;
}

const COLORS = {
    Sekolah: "#2563eb",
    Pariwisata: "#f97316",
    Lainnya: "#6b7280"
};

const EMPTY_TEXT = "Tidak tersedia";

// ---------- Peta dan basemap ----------
const map = L.map("map").setView(CONFIG.center, CONFIG.zoom);

const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// ---------- State ----------
let allFeatures = [];
let homeBounds = null;
let currentCategory = "Semua";
let searchText = "";

// Satu layer group per kategori, agar bisa diatur lewat Layer Control
const groups = {
    Sekolah: L.layerGroup(),
    Pariwisata: L.layerGroup(),
    Lainnya: L.layerGroup()
};

const layerControl = L.control.layers(
    { OpenStreetMap: osm },
    {
        "Sekolah": groups.Sekolah,
        "Pariwisata": groups.Pariwisata
    },
    { collapsed: window.innerWidth < 768 }
).addTo(map);

// ---------- Fungsi bantu ----------
function getMarkerColor(category) {
    return COLORS[category] || COLORS.Lainnya;
}

function groupKey(category) {
    return category === "Sekolah" || category === "Pariwisata" ? category : "Lainnya";
}

// Mencegah HTML/script dari data ikut dieksekusi di popup
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function valueOrEmpty(value) {
    if (value === null || value === undefined) return EMPTY_TEXT;
    const text = String(value).trim();
    return text === "" ? EMPTY_TEXT : escapeHtml(text);
}

function safeUrl(value) {
    if (!value) return null;
    const text = String(value).trim();
    return /^https?:\/\//i.test(text) ? escapeHtml(text) : null;
}

function buildPopup(p) {
    const foto = safeUrl(pick(p, "FOTO_URL", "Foto_URL"));
    const web = safeUrl(pick(p, "WEBSITE", "Website"));
    const nama = pick(p, "Nama_Objek", "NAMA_OBJ");

    let html = `<div class="popup"><h3>${valueOrEmpty(nama)}</h3>`;

    if (foto) {
        html += `<img src="${foto}" alt="Foto ${valueOrEmpty(nama)}" loading="lazy">`;
    }

    html += `
        <table>
            <tr><td>Kategori</td><td>${valueOrEmpty(pick(p, "Kategori", "KATEGORI"))}</td></tr>
            <tr><td>Subkategori</td><td>${valueOrEmpty(pick(p, "Sub_Katego", "SUB_KAT"))}</td></tr>
            <tr><td>Alamat</td><td>${valueOrEmpty(pick(p, "Alamat", "ALAMAT"))}</td></tr>
            <tr><td>Desa/Kelurahan</td><td>${valueOrEmpty(pick(p, "Desa_Kel", "DESA_KEL"))}</td></tr>
            <tr><td>Kecamatan</td><td>${valueOrEmpty(pick(p, "Kecamatan", "KECAMATAN"))}</td></tr>
            <tr><td>Kabupaten/Kota</td><td>${valueOrEmpty(pick(p, "Kabupaten", "KABUPATEN"))}</td></tr>
        </table>`;

    html += `<div class="popup-links">`;
    if (web) {
        html += `<a href="${web}" target="_blank" rel="noopener noreferrer">Website</a>`;
    }
    return html + `</div></div>`;
}

function createMarker(feature, latlng) {
    const category = feature.properties._kat;

    const marker = L.circleMarker(latlng, {
        radius: 7,
        fillColor: getMarkerColor(category),
        color: "#ffffff",
        weight: 1.5,
        fillOpacity: 0.9
    });

    marker.bindPopup(buildPopup(feature.properties));
    const nama = pick(feature.properties, "Nama_Objek", "NAMA_OBJ");
    marker.bindTooltip(nama ? String(nama) : EMPTY_TEXT);
    return marker;
}

function showNotice(text) {
    const box = document.getElementById("dataNotice");
    document.getElementById("dataNoticeText").textContent = text;
    box.hidden = false;
}

// ---------- Render marker berdasarkan filter + pencarian ----------
function renderMarkers() {
    Object.values(groups).forEach(g => g.clearLayers());

    const query = searchText.trim().toLowerCase();
    let visible = 0;

    allFeatures.forEach(feature => {
        const p = feature.properties;
        const category = p._kat;

        const matchCategory = currentCategory === "Semua" || category === currentCategory;
        const name = String(pick(p, "Nama_Objek", "NAMA_OBJ") || "").toLowerCase();
        const matchSearch = query === "" || name.includes(query);

        if (matchCategory && matchSearch) {
            const [lng, lat] = feature.geometry.coordinates;
            createMarker(feature, L.latLng(lat, lng)).addTo(groups[groupKey(category)]);
            visible++;
        }
    });

    document.getElementById("countVisible").textContent = visible;
}

// Sinkronkan layer group di peta dengan pilihan filter
function applyCategoryToMap() {
    ["Sekolah", "Pariwisata"].forEach(name => {
        const shouldShow = currentCategory === "Semua" || currentCategory === name;
        if (shouldShow && !map.hasLayer(groups[name])) map.addLayer(groups[name]);
        if (!shouldShow && map.hasLayer(groups[name])) map.removeLayer(groups[name]);
    });

    if (currentCategory === "Semua" && !map.hasLayer(groups.Lainnya)) {
        map.addLayer(groups.Lainnya);
    }
    if (currentCategory !== "Semua" && map.hasLayer(groups.Lainnya)) {
        map.removeLayer(groups.Lainnya);
    }
}

function updateStats() {
    const count = name => allFeatures.filter(f => f.properties._kat === name).length;
    document.getElementById("countSekolah").textContent = count("Sekolah");
    document.getElementById("countPariwisata").textContent = count("Pariwisata");
    document.getElementById("countTotal").textContent = allFeatures.length;
}

// ---------- Memuat data GeoJSON utama ----------
function isValidPoint(feature) {
    const g = feature && feature.geometry;
    return g && g.type === "Point" && Array.isArray(g.coordinates) &&
        g.coordinates.length >= 2 &&
        Number.isFinite(g.coordinates[0]) && Number.isFinite(g.coordinates[1]);
}

fetch(CONFIG.dataUrl)
    .then(response => {
        if (!response.ok) {
            throw new Error("Gagal memuat GeoJSON (" + response.status + ")");
        }
        return response.json();
    })
    .then(data => {
        const features = (data.features || []);
        allFeatures = features.filter(isValidPoint);
        allFeatures.forEach(f => {
            f.properties._kat = normalizeCategory(f.properties[CONFIG.fieldKategori]);
        });

        const skipped = features.length - allFeatures.length;
        if (skipped > 0) {
            showNotice(skipped + " fitur dilewati karena bukan titik (Point) atau koordinatnya tidak valid.");
        }

        if (data.metadata) {
            if (data.metadata.wilayah) document.getElementById("regionName").textContent = data.metadata.wilayah;
            if (data.metadata.sumber) document.getElementById("dataSource").textContent = data.metadata.sumber;
            if (data.metadata.tahun) document.getElementById("dataYear").textContent = data.metadata.tahun;
            if (data.metadata.catatan) showNotice(data.metadata.catatan);
        }

        updateStats();
        applyCategoryToMap();
        renderMarkers();

        if (allFeatures.length > 0) {
            const pts = allFeatures.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
            homeBounds = L.latLngBounds(pts);
            map.fitBounds(homeBounds, { padding: [30, 30] });
        }
    })
    .catch(error => {
        console.error(error);
        showNotice(
            "Data tidak dapat dimuat. Pastikan file data/sekolah_pariwisata.geojson ada dan " +
            "aplikasi dijalankan lewat server (Live Server / GitHub Pages), bukan dibuka langsung dari file explorer."
        );
    });

// ---------- Batas administrasi (opsional) ----------
// Pane khusus agar poligon batas selalu di bawah marker (klik marker tidak terhalang)
map.createPane("batas");
map.getPane("batas").style.zIndex = 350;

function loadBoundary(url, label, style) {
    return fetch(url)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
        .then(data => {
            const layer = L.geoJSON(data, {
                pane: "batas",
                style: style,
                onEachFeature: (feature, l) => {
                    const p = feature.properties || {};
                    const name = p.NAMA || p.NAMOBJ || p.WADMKK || p.WADMKC || p.nama;
                    if (name) l.bindTooltip(String(name), { sticky: true });
                }
            });
            layerControl.addOverlay(layer, label);
            return layer;
        })
        .catch(() => {
            console.info("Layer opsional '" + label + "' tidak dimuat (file tidak ada).");
            return null;
        });
}

const boundaryState = { kabupaten: false, kecamatan: false };

Promise.all([
    loadBoundary(CONFIG.boundaryKabupatenUrl, "Batas Kabupaten/Kota", {
        color: "#7c3aed", weight: 3, fillOpacity: 0, dashArray: "6 4"
    }),
    loadBoundary(CONFIG.boundaryKecamatanUrl, "Batas Kecamatan", {
        color: "#16a34a", weight: 1.5, fillOpacity: 0
    })
]).then(([kab, kec]) => {
    boundaryState.kabupaten = !!kab;
    boundaryState.kecamatan = !!kec;
    if (kab) kab.addTo(map);
    if (kec) kec.addTo(map);
    legend.addTo(map); // render ulang legenda sesuai layer yang ada
});

// ---------- Legenda ----------
const legend = L.control({ position: "bottomright" });

legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    let html = `
        <h4>Legenda</h4>
        <div class="legend-item"><span class="dot dot--sekolah"></span> Sekolah</div>
        <div class="legend-item"><span class="dot dot--pariwisata"></span> Pariwisata</div>`;

    if (boundaryState.kabupaten) {
        html += `<div class="legend-item"><span class="legend-line" style="border-color:#7c3aed;border-top-style:dashed"></span> Batas Kabupaten/Kota</div>`;
    }
    if (boundaryState.kecamatan) {
        html += `<div class="legend-item"><span class="legend-line" style="border-color:#16a34a"></span> Batas Kecamatan</div>`;
    }
    div.innerHTML = html;
    // Hindari klik legenda ikut menggeser peta
    L.DomEvent.disableClickPropagation(div);
    return div;
};

legend.addTo(map);

// ---------- Interaksi panel ----------
document.querySelectorAll('input[name="kategori"]').forEach(radio => {
    radio.addEventListener("change", event => {
        currentCategory = event.target.value;
        applyCategoryToMap();
        renderMarkers();
    });
});

document.getElementById("searchInput").addEventListener("input", event => {
    searchText = event.target.value;
    renderMarkers();
});

document.getElementById("resetView").addEventListener("click", () => {
    if (homeBounds) {
        map.fitBounds(homeBounds, { padding: [30, 30] });
    } else {
        map.setView(CONFIG.center, CONFIG.zoom);
    }
});

// Tombol panel (mobile)
const panel = document.getElementById("sidePanel");
const toggle = document.getElementById("panelToggle");

toggle.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("is-collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    setTimeout(() => map.invalidateSize(), 200);
});

// Panel tertutup otomatis di layar kecil agar peta luas
if (window.innerWidth <= 768) {
    panel.classList.add("is-collapsed");
    toggle.setAttribute("aria-expanded", "false");
    setTimeout(() => map.invalidateSize(), 100);
}

window.addEventListener("resize", () => map.invalidateSize());
