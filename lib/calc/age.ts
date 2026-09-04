export interface AgeResult {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  totalWeeks: number;
  totalMonths: number;
  daysUntilNextBirthday: number;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Calculate age between a birth date and an "as of" date.
 *
 * The years/months/days breakdown accounts for actual calendar month lengths.
 * For someone born on Feb 29, non-leap years treat Feb 28 as the anniversary.
 *
 * @throws Error if birthDate is after asOfDate.
 */
export function calculateAge(birthDate: Date, asOfDate: Date): AgeResult {
  if (birthDate.getTime() > asOfDate.getTime()) {
    throw new Error("Birth date cannot be after the 'as of' date.");
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.floor((asOfDate.getTime() - birthDate.getTime()) / msPerDay);
  const totalWeeks = Math.floor(totalDays / 7);

  const birthDay = birthDate.getDate();
  const birthMonth = birthDate.getMonth();
  const targetYear = asOfDate.getFullYear();

  // Normalize: if born on Feb 29 and the target year is not a leap year,
  // treat the birth day as Feb 28 for comparison purposes.
  let effectiveBirthDay = birthDay;
  if (birthMonth === 1 && birthDay === 29 && !isLeapYear(targetYear)) {
    effectiveBirthDay = 28;
  }

  let years = targetYear - birthDate.getFullYear();
  let months = asOfDate.getMonth() - birthMonth;
  let days = asOfDate.getDate() - effectiveBirthDay;

  // Borrow days from the previous month if needed.
  if (days < 0) {
    months--;
    const prevMonth = asOfDate.getMonth() - 1;
    const prevMonthYear = prevMonth < 0 ? targetYear - 1 : targetYear;
    const daysInPrevMonth = new Date(prevMonthYear, prevMonth + 1, 0).getDate();
    days += daysInPrevMonth;
  }

  // Borrow months from years if needed.
  if (months < 0) {
    years--;
    months += 12;
  }

  const totalMonths = years * 12 + months;

  // Next birthday: find the next anniversary on or after asOfDate.
  let nextBirthdayYear = targetYear;
  let nextBirthdayDay = birthDay;
  if (birthMonth === 1 && birthDay === 29 && !isLeapYear(nextBirthdayYear)) {
    nextBirthdayDay = 28;
  }

  let nextBirthday = new Date(nextBirthdayYear, birthMonth, nextBirthdayDay);
  if (nextBirthday.getTime() <= asOfDate.getTime()) {
    nextBirthdayYear++;
    nextBirthdayDay = birthDay;
    if (birthMonth === 1 && birthDay === 29 && !isLeapYear(nextBirthdayYear)) {
      nextBirthdayDay = 28;
    }
    nextBirthday = new Date(nextBirthdayYear, birthMonth, nextBirthdayDay);
  }

  const daysUntilNextBirthday = Math.ceil(
    (nextBirthday.getTime() - asOfDate.getTime()) / msPerDay,
  );

  return {
    years,
    months,
    days,
    totalDays,
    totalWeeks,
    totalMonths,
    daysUntilNextBirthday,
  };
}
