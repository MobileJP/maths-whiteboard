import type { Strand, Topic } from "./types";

type RawTopic = Omit<Topic, "id" | "order">;

// The Year 7 (KS3) scheme of work, per RFD §5.1: Strand → Unit ("module") → Lesson, following
// the standard UK National Curriculum programme of study. Lesson numbers reset per unit — a
// student refers to "lesson 3 of module 1", not "lesson 23 overall". Authored in display order;
// `id`/`order` below are derived from that order, not hand-maintained.
const RAW_SCHEME: RawTopic[] = [
  // --- Number: 4 units, 11 lessons ---
  {
    strand: "Number", unitNumber: 1, unitName: "Place Value & Negative Numbers", lessonNumber: 1,
    name: "Place value, ordering and rounding whole numbers",
    description: "Reading, writing and comparing large numbers, and rounding to a given power of ten.",
  },
  {
    strand: "Number", unitNumber: 1, unitName: "Place Value & Negative Numbers", lessonNumber: 2,
    name: "Negative numbers: ordering and the four operations",
    description: "Ordering positive and negative numbers on a number line, and adding, subtracting, multiplying and dividing with negatives.",
  },
  {
    strand: "Number", unitNumber: 1, unitName: "Place Value & Negative Numbers", lessonNumber: 3,
    name: "Powers, roots and order of operations (BIDMAS)",
    description: "Square and cube numbers and roots, and using BIDMAS to evaluate expressions with mixed operations.",
  },
  {
    strand: "Number", unitNumber: 2, unitName: "Factors, Multiples & Primes", lessonNumber: 1,
    name: "Multiples, factors and prime numbers",
    description: "Finding multiples and factors of a number, and identifying and testing for prime numbers.",
  },
  {
    strand: "Number", unitNumber: 2, unitName: "Factors, Multiples & Primes", lessonNumber: 2,
    name: "Highest common factor and lowest common multiple",
    description: "Using prime factorisation and listing methods to find the HCF and LCM of two numbers.",
  },
  {
    strand: "Number", unitNumber: 3, unitName: "Fractions", lessonNumber: 1,
    name: "Equivalent fractions and simplifying",
    description: "Recognising equivalent fractions and simplifying a fraction to its lowest terms.",
  },
  {
    strand: "Number", unitNumber: 3, unitName: "Fractions", lessonNumber: 2,
    name: "Adding and subtracting fractions",
    description: "Adding and subtracting fractions and mixed numbers with different denominators.",
  },
  {
    strand: "Number", unitNumber: 3, unitName: "Fractions", lessonNumber: 3,
    name: "Multiplying and dividing fractions",
    description: "Multiplying and dividing proper fractions, improper fractions and mixed numbers.",
  },
  {
    strand: "Number", unitNumber: 4, unitName: "Decimals & Percentages", lessonNumber: 1,
    name: "Decimal place value and the four operations",
    description: "Ordering decimals and adding, subtracting, multiplying and dividing decimal numbers.",
  },
  {
    strand: "Number", unitNumber: 4, unitName: "Decimals & Percentages", lessonNumber: 2,
    name: "Converting between fractions, decimals and percentages",
    description: "Converting fluently between fraction, decimal and percentage forms of the same value.",
  },
  {
    strand: "Number", unitNumber: 4, unitName: "Decimals & Percentages", lessonNumber: 3,
    name: "Percentages of amounts",
    description: "Finding a percentage of an amount, including using percentages over 100%.",
  },

  // --- Algebra: 3 units, 7 lessons ---
  {
    strand: "Algebra", unitNumber: 5, unitName: "Algebraic Expressions", lessonNumber: 1,
    name: "Algebraic notation and forming expressions",
    description: "Using letters to represent unknown numbers and writing expressions from word descriptions.",
  },
  {
    strand: "Algebra", unitNumber: 5, unitName: "Algebraic Expressions", lessonNumber: 2,
    name: "Simplifying expressions (collecting like terms)",
    description: "Combining like terms to simplify algebraic expressions.",
  },
  {
    strand: "Algebra", unitNumber: 5, unitName: "Algebraic Expressions", lessonNumber: 3,
    name: "Expanding single brackets",
    description: "Multiplying out a single bracket and simplifying the result.",
  },
  {
    strand: "Algebra", unitNumber: 6, unitName: "Equations & Substitution", lessonNumber: 1,
    name: "Substitution into expressions and formulae",
    description: "Substituting given values for letters in an expression or formula and evaluating the result.",
  },
  {
    strand: "Algebra", unitNumber: 6, unitName: "Equations & Substitution", lessonNumber: 2,
    name: "Solving linear equations",
    description: "Solving one- and two-step linear equations using inverse operations.",
  },
  {
    strand: "Algebra", unitNumber: 7, unitName: "Sequences & Graphs", lessonNumber: 1,
    name: "Sequences: term-to-term and position-to-term rules",
    description: "Continuing number sequences and describing them with term-to-term and simple position-to-term rules.",
  },
  {
    strand: "Algebra", unitNumber: 7, unitName: "Sequences & Graphs", lessonNumber: 2,
    name: "Coordinates and straight-line graphs",
    description: "Plotting coordinates in all four quadrants and drawing simple straight-line graphs.",
  },

  // --- Ratio & Proportion: 1 unit, 3 lessons ---
  {
    strand: "Ratio & Proportion", unitNumber: 8, unitName: "Ratio & Proportion", lessonNumber: 1,
    name: "Introduction to ratio and simplifying ratios",
    description: "Writing and simplifying ratios to describe how quantities compare.",
  },
  {
    strand: "Ratio & Proportion", unitNumber: 8, unitName: "Ratio & Proportion", lessonNumber: 2,
    name: "Dividing a quantity in a given ratio",
    description: "Sharing an amount between parts according to a given ratio.",
  },
  {
    strand: "Ratio & Proportion", unitNumber: 8, unitName: "Ratio & Proportion", lessonNumber: 3,
    name: "Direct proportion and best value",
    description: "Using direct proportion to solve problems, including comparing prices to find the best value.",
  },

  // --- Geometry & Measures: 4 units, 8 lessons ---
  {
    strand: "Geometry & Measures", unitNumber: 9, unitName: "Angles & Shape Properties", lessonNumber: 1,
    name: "Measuring and drawing angles; angles on a line and at a point",
    description: "Using a protractor to measure and draw angles, and finding missing angles on a straight line and around a point.",
  },
  {
    strand: "Geometry & Measures", unitNumber: 9, unitName: "Angles & Shape Properties", lessonNumber: 2,
    name: "Angles in triangles and quadrilaterals",
    description: "Using angle sum facts to find missing angles in triangles and quadrilaterals.",
  },
  {
    strand: "Geometry & Measures", unitNumber: 10, unitName: "Perimeter, Area & Volume", lessonNumber: 1,
    name: "Perimeter and area of rectangles and triangles",
    description: "Calculating the perimeter and area of rectangles and triangles.",
  },
  {
    strand: "Geometry & Measures", unitNumber: 10, unitName: "Perimeter, Area & Volume", lessonNumber: 2,
    name: "Area of parallelograms and compound shapes",
    description: "Calculating the area of parallelograms and shapes made from combinations of rectangles and triangles.",
  },
  {
    strand: "Geometry & Measures", unitNumber: 10, unitName: "Perimeter, Area & Volume", lessonNumber: 3,
    name: "Volume and surface area of cuboids",
    description: "Calculating the volume and surface area of cuboids.",
  },
  {
    strand: "Geometry & Measures", unitNumber: 11, unitName: "Transformations", lessonNumber: 1,
    name: "Reflection and rotation",
    description: "Reflecting and rotating shapes on a coordinate grid.",
  },
  {
    strand: "Geometry & Measures", unitNumber: 11, unitName: "Transformations", lessonNumber: 2,
    name: "Translation and enlargement",
    description: "Translating shapes using vectors and enlarging shapes by a given scale factor.",
  },
  {
    strand: "Geometry & Measures", unitNumber: 12, unitName: "Units & Measures", lessonNumber: 1,
    name: "Converting metric units and compound measures (e.g. speed)",
    description: "Converting between metric units of length, mass and capacity, and working with compound measures such as speed.",
  },

  // --- Statistics: 1 unit, 4 lessons ---
  {
    strand: "Statistics", unitNumber: 13, unitName: "Data Handling", lessonNumber: 1,
    name: "Collecting and organising data; frequency tables",
    description: "Collecting data and organising it into tally charts and frequency tables.",
  },
  {
    strand: "Statistics", unitNumber: 13, unitName: "Data Handling", lessonNumber: 2,
    name: "Bar charts and pictograms",
    description: "Drawing and interpreting bar charts and pictograms, including choosing an appropriate scale.",
  },
  {
    strand: "Statistics", unitNumber: 13, unitName: "Data Handling", lessonNumber: 3,
    name: "Pie charts",
    description: "Drawing and interpreting pie charts, including calculating the angle for each category.",
  },
  {
    strand: "Statistics", unitNumber: 13, unitName: "Data Handling", lessonNumber: 4,
    name: "Averages and range (mean, median, mode, range)",
    description: "Calculating the mean, median, mode and range of a data set, and choosing which average to use.",
  },

  // --- Probability: 1 unit, 2 lessons ---
  {
    strand: "Probability", unitNumber: 14, unitName: "Probability", lessonNumber: 1,
    name: "The probability scale and single events",
    description: "Describing and estimating the likelihood of single events using words and the 0–1 probability scale.",
  },
  {
    strand: "Probability", unitNumber: 14, unitName: "Probability", lessonNumber: 2,
    name: "Listing outcomes and simple probability calculations",
    description: "Listing all possible outcomes of an event and calculating simple theoretical probabilities.",
  },
];

export const YEAR7_SCHEME: readonly Topic[] = Object.freeze(
  RAW_SCHEME.map((t, i) => ({
    ...t,
    id: `u${t.unitNumber}-l${t.lessonNumber}`,
    order: i + 1,
  })),
);

export function getTopicById(id: string): Topic | undefined {
  return YEAR7_SCHEME.find((t) => t.id === id);
}

export interface StrandGroup {
  strand: Strand;
  units: { unitNumber: number; unitName: string; lessons: Topic[] }[];
}

// Groups by first-appearance order in `scheme`, so display order matches how the scheme was
// authored (strand by strand, unit by unit) without needing a separately-maintained ordering.
export function groupScheme(scheme: readonly Topic[] = YEAR7_SCHEME): StrandGroup[] {
  const strandGroups: StrandGroup[] = [];

  for (const topic of scheme) {
    let strandGroup = strandGroups.find((g) => g.strand === topic.strand);
    if (!strandGroup) {
      strandGroup = { strand: topic.strand, units: [] };
      strandGroups.push(strandGroup);
    }

    let unit = strandGroup.units.find((u) => u.unitNumber === topic.unitNumber);
    if (!unit) {
      unit = { unitNumber: topic.unitNumber, unitName: topic.unitName, lessons: [] };
      strandGroup.units.push(unit);
    }

    unit.lessons.push(topic);
  }

  return strandGroups;
}

// The exact string sent to /api/lesson and /api/questions for a scheme-sourced lesson — both
// routes take an arbitrary `{ topic: string }` and don't inspect its provenance, so no API
// changes are needed to support scheme-driven generation.
export function schemeTopicPrompt(topic: Topic): string {
  return `${topic.name} — ${topic.description}`;
}
