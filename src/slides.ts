import { getAccessToken } from "./auth.js";

const SLIDES_BASE = "https://slides.googleapis.com/v1/presentations";

interface TextElement {
  textRun?: { content: string };
}

interface ShapeProperties {
  shapeType?: string;
}

interface PageElement {
  shape?: {
    shapeProperties?: ShapeProperties;
    shapeType?: string;
    text?: { textElements: TextElement[] };
  };
  table?: {
    tableRows: Array<{
      tableCells: Array<{
        text?: { textElements: TextElement[] };
      }>;
    }>;
  };
}

interface Slide {
  objectId: string;
  slideProperties?: {
    notesPage?: {
      pageElements?: PageElement[];
    };
  };
  pageElements?: PageElement[];
}

interface Presentation {
  title: string;
  slides: Slide[];
}

function extractTextFromElements(elements: TextElement[]): string {
  return elements
    .map((el) => el.textRun?.content || "")
    .join("")
    .trim();
}

function extractPageText(pageElements: PageElement[]): string {
  const parts: string[] = [];

  for (const el of pageElements) {
    if (el.shape?.text) {
      const text = extractTextFromElements(el.shape.text.textElements);
      if (text) parts.push(text);
    }
    if (el.table) {
      for (const row of el.table.tableRows) {
        const cells = row.tableCells
          .map((cell) =>
            cell.text ? extractTextFromElements(cell.text.textElements) : ""
          )
          .join("\t");
        if (cells.trim()) parts.push(cells);
      }
    }
  }

  return parts.join("\n");
}

export async function read(presentationId: string): Promise<string> {
  const token = await getAccessToken();

  const res = await fetch(`${SLIDES_BASE}/${presentationId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Slides API error ${res.status}: ${text}`);
  }

  const pres: Presentation = await res.json();
  const slideTexts: string[] = [];

  for (let i = 0; i < pres.slides.length; i++) {
    const slide = pres.slides[i];
    const content = extractPageText(slide.pageElements || []);

    let notes = "";
    const notesElements = slide.slideProperties?.notesPage?.pageElements;
    if (notesElements) {
      notes = extractPageText(notesElements);
    }

    let slideText = `--- Slide ${i + 1} ---\n${content || "(no content)"}`;
    if (notes) {
      slideText += `\nSpeaker Notes: ${notes}`;
    }
    slideTexts.push(slideText);
  }

  return `Title: ${pres.title}\nSlides: ${pres.slides.length}\n\n${slideTexts.join("\n\n")}`;
}
