/**
 * GDPR territory and authority directory reviewed on 2026-09-30.
 * Sources: EDPB member directory and EFTA's 2018-07-20 commencement notice.
 * This is authority routing information, not a national-law or holiday calendar.
 */
export const EDPB_AUTHORITY_DIRECTORY =
  "https://www.edpb.europa.eu/about-edpb/our-members_en";
export const EDPB_RIGHTS_GUIDE =
  "https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en";
export const EEA_GDPR_COMMENCEMENT_SOURCE =
  "https://www.efta.int/media-resources/news/general-data-protection-regulation-gdpr-entered-force-eea";

export interface GdprCountry {
  code: string;
  name: string;
  authority: string;
  authorityUrl: string;
  eeaEfta?: boolean;
  authorityNote?: string;
}

export const GDPR_COUNTRIES: readonly GdprCountry[] = [
  {
    code: "AT",
    name: "Austria",
    authority: "Österreichische Datenschutzbehörde",
    authorityUrl: "https://dsb.gv.at/",
    authorityNote:
      "Austria has separate supervision for some parliamentary processing; check competence before filing.",
  },
  {
    code: "BE",
    name: "Belgium",
    authority: "Autorité de protection des données / Gegevensbeschermingsautoriteit",
    authorityUrl: "https://www.autoriteprotectiondonnees.be/",
  },
  {
    code: "BG",
    name: "Bulgaria",
    authority: "Commission for Personal Data Protection",
    authorityUrl: "https://www.cpdp.bg/",
  },
  {
    code: "HR",
    name: "Croatia",
    authority: "Agencija za zaštitu osobnih podataka",
    authorityUrl: "https://azop.hr/",
  },
  {
    code: "CY",
    name: "Cyprus",
    authority: "Commissioner for Personal Data Protection",
    authorityUrl: "https://www.dataprotection.gov.cy/",
  },
  {
    code: "CZ",
    name: "Czechia",
    authority: "Office for Personal Data Protection",
    authorityUrl: "https://uoou.gov.cz/",
  },
  {
    code: "DK",
    name: "Denmark",
    authority: "Datatilsynet (Denmark)",
    authorityUrl: "https://www.datatilsynet.dk/",
  },
  {
    code: "EE",
    name: "Estonia",
    authority: "Andmekaitse Inspektsioon",
    authorityUrl: "https://www.aki.ee/",
  },
  {
    code: "FI",
    name: "Finland",
    authority: "Data Protection Ombudsman's Office",
    authorityUrl: "https://tietosuoja.fi/en/home",
  },
  {
    code: "FR",
    name: "France",
    authority: "Commission nationale de l'informatique et des libertés (CNIL)",
    authorityUrl: "https://www.cnil.fr/",
  },
  {
    code: "DE",
    name: "Germany",
    authority: "Competent German state or federal data protection authority",
    authorityUrl:
      "https://www.bfdi.bund.de/EN/Service/Anschriften/Laender/Laender-node.html",
    authorityNote:
      "German supervision is divided among state and federal authorities. Use the official directory to identify the competent authority; BfDI is not the general supervisor of all private brokers.",
  },
  {
    code: "GR",
    name: "Greece",
    authority: "Hellenic Data Protection Authority",
    authorityUrl: "https://www.dpa.gr/",
  },
  {
    code: "HU",
    name: "Hungary",
    authority: "National Authority for Data Protection and Freedom of Information",
    authorityUrl: "https://www.naih.hu/",
  },
  {
    code: "IS",
    name: "Iceland",
    authority: "Persónuvernd",
    authorityUrl: "https://www.personuvernd.is/",
    eeaEfta: true,
  },
  {
    code: "IE",
    name: "Ireland",
    authority: "Data Protection Commission",
    authorityUrl: "https://www.dataprotection.ie/",
  },
  {
    code: "IT",
    name: "Italy",
    authority: "Garante per la protezione dei dati personali",
    authorityUrl: "https://www.garanteprivacy.it/",
  },
  {
    code: "LV",
    name: "Latvia",
    authority: "Datu valsts inspekcija",
    authorityUrl: "https://www.dvi.gov.lv/",
  },
  {
    code: "LI",
    name: "Liechtenstein",
    authority: "Datenschutzstelle Liechtenstein",
    authorityUrl: "https://www.datenschutzstelle.li/",
    eeaEfta: true,
  },
  {
    code: "LT",
    name: "Lithuania",
    authority: "State Data Protection Inspectorate",
    authorityUrl: "https://vdai.lrv.lt/",
  },
  {
    code: "LU",
    name: "Luxembourg",
    authority: "Commission nationale pour la protection des données",
    authorityUrl: "https://cnpd.public.lu/fr.html",
  },
  {
    code: "MT",
    name: "Malta",
    authority: "Information and Data Protection Commissioner",
    authorityUrl: "https://idpc.org.mt/",
  },
  {
    code: "NL",
    name: "Netherlands",
    authority: "Autoriteit Persoonsgegevens",
    authorityUrl: "https://autoriteitpersoonsgegevens.nl/",
  },
  {
    code: "NO",
    name: "Norway",
    authority: "Datatilsynet (Norway)",
    authorityUrl: "https://www.datatilsynet.no/",
    eeaEfta: true,
  },
  {
    code: "PL",
    name: "Poland",
    authority: "Urząd Ochrony Danych Osobowych",
    authorityUrl: "https://uodo.gov.pl/",
  },
  {
    code: "PT",
    name: "Portugal",
    authority: "Comissão Nacional de Proteção de Dados",
    authorityUrl: "https://www.cnpd.pt/",
  },
  {
    code: "RO",
    name: "Romania",
    authority: "National Supervisory Authority for Personal Data Processing",
    authorityUrl: "https://www.dataprotection.ro/",
  },
  {
    code: "SK",
    name: "Slovakia",
    authority: "Office for Personal Data Protection of the Slovak Republic",
    authorityUrl: "https://dataprotection.gov.sk/en/",
  },
  {
    code: "SI",
    name: "Slovenia",
    authority: "Information Commissioner",
    authorityUrl: "https://www.ip-rs.si/",
  },
  {
    code: "ES",
    name: "Spain",
    authority: "Agencia Española de Protección de Datos",
    authorityUrl: "https://www.aepd.es/",
  },
  {
    code: "SE",
    name: "Sweden",
    authority: "Integritetsskyddsmyndigheten",
    authorityUrl: "https://www.imy.se/",
  },
];
