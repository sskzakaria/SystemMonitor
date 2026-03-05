/**
 * CPU Age Detection Utility
 * Analyzes CPU model strings to determine approximate age
 */

interface CPUAgeInfo {
  age: number | null;
  generation: string | null;
  releaseYear: number | null;
}

/**
 * Extract generation/year information from CPU model string
 */
export function analyzeCPUAge(cpuModel: string | null): CPUAgeInfo | null {
  if (!cpuModel) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  let releaseYear: number | null = null;
  let generation: string | null = null;

  const model = cpuModel.toLowerCase();

  // Intel CPU detection
  if (model.includes('intel')) {
    // 13th Gen (2022-2023)
    if (model.match(/i[3579]-13\d{3}/)) {
      releaseYear = 2022;
      generation = '13th Gen';
    }
    // 12th Gen (2021-2022)
    else if (model.match(/i[3579]-12\d{3}/)) {
      releaseYear = 2021;
      generation = '12th Gen';
    }
    // 11th Gen (2020-2021)
    else if (model.match(/i[3579]-11\d{3}/)) {
      releaseYear = 2020;
      generation = '11th Gen';
    }
    // 10th Gen (2019-2020)
    else if (model.match(/i[3579]-10\d{3}/)) {
      releaseYear = 2019;
      generation = '10th Gen';
    }
    // 9th Gen (2018-2019)
    else if (model.match(/i[3579]-9\d{3}/)) {
      releaseYear = 2018;
      generation = '9th Gen';
    }
    // 8th Gen (2017-2018)
    else if (model.match(/i[3579]-8\d{3}/)) {
      releaseYear = 2017;
      generation = '8th Gen';
    }
    // 7th Gen (2016-2017)
    else if (model.match(/i[3579]-7\d{3}/)) {
      releaseYear = 2016;
      generation = '7th Gen';
    }
    // 6th Gen (2015-2016)
    else if (model.match(/i[3579]-6\d{3}/)) {
      releaseYear = 2015;
      generation = '6th Gen';
    }
    // Older generations
    else if (model.match(/i[3579]-[45]\d{3}/)) {
      releaseYear = 2013;
      generation = '4th-5th Gen';
    }
  }

  // AMD Ryzen detection
  else if (model.includes('ryzen')) {
    // Ryzen 9000 series (2024) - Zen 5 architecture
    if (model.match(/ryzen [3579] 9\d{3}/)) {
      releaseYear = 2024;
      generation = 'Ryzen 9000';
    }
    // Ryzen 8000 series (2023-2024) - APUs
    else if (model.match(/ryzen [3579] 8\d{3}/)) {
      releaseYear = 2023;
      generation = 'Ryzen 8000';
    }
    // Ryzen 7000 series (2022-2023)
    else if (model.match(/ryzen [3579] 7\d{3}/)) {
      releaseYear = 2022;
      generation = 'Ryzen 7000';
    }
    // Ryzen 5000 series (2020-2021)
    else if (model.match(/ryzen [3579] 5\d{3}/)) {
      releaseYear = 2020;
      generation = 'Ryzen 5000';
    }
    // Ryzen 3000 series (2019)
    else if (model.match(/ryzen [3579] 3\d{3}/)) {
      releaseYear = 2019;
      generation = 'Ryzen 3000';
    }
    // Ryzen 2000 series (2018)
    else if (model.match(/ryzen [3579] 2\d{3}/)) {
      releaseYear = 2018;
      generation = 'Ryzen 2000';
    }
    // Ryzen 1000 series (2017)
    else if (model.match(/ryzen [3579] 1\d{3}/)) {
      releaseYear = 2017;
      generation = 'Ryzen 1000';
    }
  }

  // Calculate age if we found a release year
  const age = releaseYear ? currentYear - releaseYear : null;

  return {
    age,
    generation,
    releaseYear
  };
}

/**
 * Get a human-readable age description
 */
export function getCPUAgeDescription(age: number | null): string {
  if (age === null) return 'Unknown age';
  if (age <= 1) return 'Very new';
  if (age <= 2) return 'Recent';
  if (age <= 3) return 'Modern';
  if (age <= 5) return 'Moderate';
  if (age <= 7) return 'Aging';
  return 'Old';
}