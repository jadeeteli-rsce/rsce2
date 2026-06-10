const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio'); // can keep this, just won't be used anymore
const puppeteer = require('puppeteer');   // ADD THIS
const pdfParse = require('pdf-parse');    // ADD THIS
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const fs = require('fs');

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

const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
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
  // ... all your URLs
];
