import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { DIFFICULTY_LABELS, UNIT_LABELS, formatTime } from "@/lib/recipes/types";
import type { Difficulty, Unit } from "@/lib/recipes/types";

/**
 * Printable cookbook (zadání §11). Deliberately WITHOUT nutrition values —
 * a printed page cannot be kept in sync with the food catalogue, and the
 * cookbook is for cooking, not for accounting.
 *
 * Fonts are the same Fraunces/Inter as the web (D-010), converted to TTF by
 * scripts/build-pdf-fonts.mjs because fontkit cannot read woff2.
 */
const fontDir = path.join(process.cwd(), "assets", "fonts");
let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Fraunces",
    fonts: [
      { src: path.join(fontDir, "Fraunces-Regular.ttf"), fontWeight: 400 },
      { src: path.join(fontDir, "Fraunces-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(fontDir, "Inter-Regular.ttf"), fontWeight: 400 },
      { src: path.join(fontDir, "Inter-SemiBold.ttf"), fontWeight: 600 },
    ],
  });
  // Czech hyphenation would need a dictionary; breaking words by guess is
  // worse than a ragged edge.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const COLORS = {
  text: "#2D2620",
  muted: "#7A7064",
  primary: "#C2571B",
  border: "#E5DCCC",
  warm: "#F3ECDF",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Inter",
    fontSize: 10.5,
    color: COLORS.text,
    lineHeight: 1.5,
  },
  coverTitle: {
    fontFamily: "Fraunces",
    fontWeight: 700,
    fontSize: 38,
    color: COLORS.primary,
    marginBottom: 8,
  },
  coverMeta: { fontSize: 11, color: COLORS.muted },
  contentsHeading: {
    fontFamily: "Fraunces",
    fontWeight: 700,
    fontSize: 18,
    marginTop: 36,
    marginBottom: 8,
  },
  contentsRow: { fontSize: 11, marginBottom: 3 },
  title: {
    fontFamily: "Fraunces",
    fontWeight: 700,
    fontSize: 24,
    color: COLORS.primary,
  },
  meta: { fontSize: 10, color: COLORS.muted, marginTop: 2, marginBottom: 10 },
  photo: { width: "100%", height: 190, objectFit: "cover", marginBottom: 12 },
  intro: { fontSize: 11, marginBottom: 12 },
  prepAhead: {
    backgroundColor: COLORS.warm,
    padding: 8,
    marginBottom: 12,
    fontSize: 10,
  },
  columns: { flexDirection: "row", gap: 20 },
  ingredientCol: { width: "38%" },
  stepsCol: { width: "62%" },
  sectionHeading: {
    fontFamily: "Fraunces",
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 6,
  },
  groupHeading: { fontFamily: "Inter", fontWeight: 600, fontSize: 10, marginTop: 6, marginBottom: 2 },
  ingredientRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    paddingBottom: 2,
    marginBottom: 2,
    gap: 6,
  },
  amount: { color: COLORS.muted },
  step: { flexDirection: "row", marginBottom: 7, gap: 6 },
  stepNumber: {
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLORS.primary,
    fontSize: 12,
    width: 16,
  },
  notes: {
    marginTop: 14,
    backgroundColor: COLORS.warm,
    padding: 8,
    fontSize: 10,
  },
  source: { marginTop: 8, fontSize: 9, color: COLORS.muted },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: COLORS.muted,
  },
});

export type PdfIngredient = {
  groupName: string | null;
  name: string;
  amount: number | null;
  unit: string | null;
  note: string | null;
  isOptional: boolean;
};

export type PdfRecipe = {
  id: string;
  title: string;
  intro: string | null;
  baseServings: number;
  totalTimeMin: number | null;
  difficulty: string | null;
  notes: string | null;
  source: string | null;
  prepAhead: { leadTimeHours: number; description: string } | null;
  ingredients: PdfIngredient[];
  steps: string[];
  /** Pre-decoded JPEG of the main photo, if any. */
  photo: Buffer | null;
};

function amountText(i: PdfIngredient): string {
  const unit = i.unit ? (UNIT_LABELS[i.unit as Unit] ?? i.unit) : "";
  const amount =
    i.amount == null
      ? ""
      : String(Math.round(i.amount * 1000) / 1000).replace(".", ",");
  return [amount, unit].filter(Boolean).join(" ");
}

function RecipePage({ recipe }: { recipe: PdfRecipe }) {
  const meta = [
    `${recipe.baseServings} porcí`,
    formatTime(recipe.totalTimeMin),
    recipe.difficulty
      ? DIFFICULTY_LABELS[recipe.difficulty as Difficulty]
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Keep the original order of groups as they appear in the ingredient list.
  const groups: (string | null)[] = [];
  for (const i of recipe.ingredients) {
    if (!groups.includes(i.groupName)) groups.push(i.groupName);
  }

  return (
    <Page size="A4" style={styles.page} wrap>
      <Text style={styles.title}>{recipe.title}</Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {recipe.photo ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop
        <Image style={styles.photo} src={{ data: recipe.photo, format: "jpg" }} />
      ) : null}
      {recipe.intro ? <Text style={styles.intro}>{recipe.intro}</Text> : null}
      {recipe.prepAhead ? (
        <Text style={styles.prepAhead}>
          Příprava předem ({recipe.prepAhead.leadTimeHours} h dopředu):{" "}
          {recipe.prepAhead.description}
        </Text>
      ) : null}

      <View style={styles.columns}>
        <View style={styles.ingredientCol}>
          <Text style={styles.sectionHeading}>Ingredience</Text>
          {groups.map((group) => (
            <View key={group ?? "_"}>
              {group ? <Text style={styles.groupHeading}>{group}</Text> : null}
              {recipe.ingredients
                .filter((i) => i.groupName === group)
                .map((i, idx) => (
                  <View key={idx} style={styles.ingredientRow}>
                    <Text>
                      {i.name}
                      {i.note ? ` (${i.note})` : ""}
                      {i.isOptional ? " — volitelně" : ""}
                    </Text>
                    <Text style={styles.amount}>{amountText(i)}</Text>
                  </View>
                ))}
            </View>
          ))}
        </View>

        <View style={styles.stepsCol}>
          <Text style={styles.sectionHeading}>Postup</Text>
          {recipe.steps.map((step, idx) => (
            <View key={idx} style={styles.step}>
              <Text style={styles.stepNumber}>{idx + 1}.</Text>
              <Text style={{ flex: 1 }}>{step}</Text>
            </View>
          ))}
        </View>
      </View>

      {recipe.notes ? (
        <Text style={styles.notes}>Poznámky: {recipe.notes}</Text>
      ) : null}
      {recipe.source ? (
        <Text style={styles.source}>Zdroj: {recipe.source}</Text>
      ) : null}

      <View style={styles.footer} fixed>
        <Text>{recipe.title}</Text>
        <Text
          render={({ pageNumber }) => String(pageNumber)}
        />
      </View>
    </Page>
  );
}

export async function renderCookbookPdf({
  householdName,
  recipes,
}: {
  householdName: string;
  recipes: PdfRecipe[];
}): Promise<Buffer> {
  registerFonts();

  const printedAt = new Date().toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const doc = (
    <Document
      title={`Kuchařka — ${householdName}`}
      author={householdName}
      creator="Naše domácnost"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.coverTitle}>Kuchařka</Text>
        <Text style={styles.coverMeta}>
          {householdName} · {printedAt} ·{" "}
          {recipes.length === 1 ? "1 recept" : `${recipes.length} receptů`}
        </Text>
        <Text style={styles.contentsHeading}>Obsah</Text>
        {recipes.map((r, idx) => (
          <Text key={r.id} style={styles.contentsRow}>
            {idx + 1}. {r.title}
          </Text>
        ))}
      </Page>
      {recipes.map((r) => (
        <RecipePage key={r.id} recipe={r} />
      ))}
    </Document>
  );

  return renderToBuffer(doc);
}
