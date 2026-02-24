import { getAccessToken } from "./auth.js";

const FORMS_BASE = "https://forms.googleapis.com/v1/forms";

interface FormItem {
  itemId: string;
  title?: string;
  description?: string;
  questionItem?: {
    question: {
      questionId: string;
      required?: boolean;
      choiceQuestion?: { type: string; options: Array<{ value: string }> };
      textQuestion?: { paragraph?: boolean };
      scaleQuestion?: { low: number; high: number };
    };
  };
}

interface Form {
  formId: string;
  info: { title: string; description?: string };
  items?: FormItem[];
}

interface FormResponse {
  responseId: string;
  createTime: string;
  answers: Record<string, { questionId: string; textAnswers?: { answers: Array<{ value: string }> } }>;
}

export async function readForm(formId: string): Promise<string> {
  const token = await getAccessToken();

  const res = await fetch(`${FORMS_BASE}/${formId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Forms API error ${res.status}: ${text}`);
  }

  const form: Form = await res.json();
  let output = `Form: ${form.info.title}`;
  if (form.info.description) output += `\nDescription: ${form.info.description}`;

  if (form.items?.length) {
    output += `\nQuestions (${form.items.length}):\n`;
    for (const item of form.items) {
      if (item.title) {
        output += `\n- ${item.title}`;
        if (item.questionItem?.question.required) output += " (required)";
        if (item.description) output += `\n  ${item.description}`;
        const q = item.questionItem?.question;
        if (q?.choiceQuestion) {
          output += `\n  Type: ${q.choiceQuestion.type}`;
          output += `\n  Options: ${q.choiceQuestion.options.map((o) => o.value).join(", ")}`;
        }
      }
    }
  }

  return output;
}

export async function listResponses(formId: string, maxResults: number = 20): Promise<string> {
  const token = await getAccessToken();

  const res = await fetch(`${FORMS_BASE}/${formId}/responses?pageSize=${maxResults}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": "datadog-community",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Forms API error ${res.status}: ${text}`);
  }

  const data: { responses?: FormResponse[] } = await res.json();
  if (!data.responses?.length) {
    return "No responses found.";
  }

  const lines = data.responses.map((r) => {
    const answers = Object.values(r.answers)
      .map((a) => {
        const vals = a.textAnswers?.answers.map((v) => v.value).join(", ") || "(empty)";
        return `  ${a.questionId}: ${vals}`;
      })
      .join("\n");
    return `Response (${r.createTime}):\n${answers}`;
  });

  return `Responses (${data.responses.length}):\n\n${lines.join("\n\n")}`;
}
