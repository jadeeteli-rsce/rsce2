const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio'); // can keep this, just won't be used anymore
const puppeteer = require('puppeteer');   // ADD THIS
const pdfParse = require('pdf-parse');    // ADD THIS
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

let websiteContent = '';

const RSCE_URLS = [
  'https://www.rsce.es/',
  'https://www.rsce.es/quienes-somos/',
  'https://www.rsce.es/organigrama/',
  'https://www.rsce.es/socios-abonados/',
  'https://www.rsce.es/eventos-rsce/',
  'https://www.rsce.es/razas-espanolas/',
  'https://www.rsce.es/morfologia/',
  'https://www.rsce.es/agility/',
  'https://www.rsce.es/igp/',
  'https://www.rsce.es/obediencia/',
  'https://www.rsce.es/busqueda-y-rescate/',
  'https://www.rsce.es/rally-obediencia/',
  'https://www.rsce.es/grooming/',
  'https://www.rsce.es/salud-y-bienestar-rsce/',
  'https://www.rsce.es/criadores/',
  'https://www.rsce.es/criadores-premium/',
  'https://www.rsce.es/servicios-rsce/',
  'https://www.rsce.es/tramites-rsc/',
  'https://www.rsce.es/afijos/',
  'https://www.rsce.es/displasia/',
  'https://www.rsce.es/certificados-de-pedigree/',
  'https://www.rsce.es/tarifas/',
  'https://www.rsce.es/contacto-rsce/',
  'https://www.rsce.es/reglamentos_rsce/',
  'https://www.rsce.es/area-de-formaciones/',
  'https://www.rsce.es/noticias-rsce/',
  'https://www.rsce.es/jueces-de-la-rsce/',
  'https://www.rsce.es/faq/',
];

// ── REPLACE YOUR OLD scrapeWebsite WITH THIS ──────────────────────────────────
async function scrapeWebsite() {
  console.log('Iniciando extracción del sitio web de la RSCE...');
  let allContent = '';

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  for (const url of RSCE_URLS) {
    try {
      console.log(`Extrayendo: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

      const clickableSelectors = [
        '[role="tab"]', '.tab', '.nav-link', '.accordion-button',
        '[data-toggle="tab"]', '[data-bs-toggle="tab"]', '[data-bs-toggle="collapse"]',
      ];

      for (const selector of clickableSelectors) {
        const elements = await page.$$(selector);
        for (const el of elements) {
          try { await el.click(); await page.waitForTimeout(400); } catch (_) {}
        }
      }

      const { title, description, content } = await page.evaluate(() => {
        ['nav', 'footer', 'script', 'style', '.cookie-banner', '#cookie-law-info-bar']
          .forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
        return {
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.content || '',
          content: document.body.innerText
        };
      });

      allContent += `\n\n--- Página: ${title} ---\nURL: ${url}\nDescripción: ${description}\n${content}`;

      const pdfLinks = await page.evaluate((base) => {
        return [...document.querySelectorAll('a[href$=".pdf"]')]
          .map(a => a.href)
          .filter(href => href.startsWith(base));
      }, 'https://www.rsce.es');

      for (const pdfUrl of pdfLinks) {
        try {
          const response = await axios.get(pdfUrl, { responseType: 'arraybuffer', timeout: 10000 });
          const { text } = await pdfParse(Buffer.from(response.data));
          allContent += `\n\n--- PDF: ${pdfUrl} ---\n${text}`;
          console.log(`  PDF extraído: ${pdfUrl}`);
        } catch (e) {
          console.warn(`  PDF fallido: ${pdfUrl}`, e.message);
        }
      }

    } catch (error) {
      console.error(`Error al extraer ${url}:`, error.message);
    }
  }

  await browser.close();
  websiteContent = allContent;
  console.log(`Longitud del contenido extraído: ${websiteContent.length} caracteres`);
  return websiteContent;
}
// ── END OF REPLACEMENT ─────────────────────────────────────────────────────────

scrapeWebsite().catch(err => console.error('Error al extraer el sitio web:', err));
setInterval(scrapeWebsite, 24 * 60 * 60 * 1000);

app.post('/api/chat', async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage || userMessage.trim() === '') {
    return res.json({ reply: "¡Por favor, escribe una pregunta!", confidence: "none" });
  }

  if (!websiteContent) {
    return res.json({
      reply: "Todavía estoy cargando la información del sitio web de la RSCE. Por favor, inténtalo de nuevo en un momento.",
      confidence: "low"
    });
  }

  try {
    const prompt = `Eres un asistente virtual de la RSCE (Real Sociedad Canina de España). 
Responde SIEMPRE en español, independientemente del idioma en que te hagan la pregunta.
Basándote ÚNICAMENTE en el contenido del sitio web proporcionado, responde de forma precisa, 
detallada y amable. Si la información no está disponible, indícalo claramente y sugiere 
contactar con info@rsce.es o llamar a la RSCE.

Contenido del sitio web:
${websiteContent}

Pregunta del usuario: ${userMessage}`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    res.json({ reply, confidence: "high", source: "basado-en-web" });

  } catch (error) {
    console.error('Error al llamar a Gemini:', error.message);
    res.json({
      reply: "Ha ocurrido un error. Por favor, inténtalo de nuevo o contáctanos en info@rsce.es",
      confidence: "low",
      error: error.message
    });
  }
});

app.post('/api/rescrape', async (req, res) => {
  try {
    await scrapeWebsite();
    res.json({ message: "Contenido del sitio web actualizado correctamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'activo',
    contenidoCargado: websiteContent.length > 0,
    tamanoContenido: websiteContent.length,
    proveedorIA: 'Google Gemini (gemini-2.5-flash)'
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Chatbot RSCE ejecutándose en el puerto ${PORT}`);
  console.log(`Proveedor de IA: Google Gemini (gemini-2.5-flash)`);
  console.log(`Abre http://localhost:${PORT} en tu navegador`);
});