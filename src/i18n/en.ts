// English dictionary: the alternative language. Typed against the Polish shape, so both languages
// always carry exactly the same keys.
import type { Dictionary } from "@/i18n";
import { plural } from "@/i18n/plural";

export const en: Dictionary = {
  language: {
    switchTo: {
      pl: "Switch language to Polish",
      en: "Switch language to English",
    },
    short: {
      pl: "PL",
      en: "EN",
    },
  },
  config: {
    attention: "Note:",
    items: {
      supabase: {
        message: "Supabase is not configured — authentication features are disabled.",
        docsLabel: "See the setup instructions",
      },
    },
  },
  header: {
    mainNav: "Main",
    trainings: "Trainings",
    dashboard: "Dashboard",
    accountMenu: "Account menu",
    profile: "Profile",
    signIn: "Sign in",
    signOut: "Sign out",
  },
  theme: {
    group: "Colour theme",
    light: "Light",
    dark: "Dark",
  },
  common: {
    signedInAs: "Signed in as",
  },
  positions: {
    setter: "Setter",
    outside: "Outside hitter",
    opposite: "Opposite",
    middle: "Middle blocker",
    libero: "Libero",
  },
  auth: {
    fields: {
      email: "Email Address",
      password: "Password",
      confirmPassword: "Confirm Password",
    },
    passwordToggle: {
      show: "Show password",
      hide: "Hide password",
    },
    validation: {
      emailRequired: "Email is required",
      emailInvalid: "Enter a valid email address",
      passwordRequired: "Password is required",
      passwordTooShort: (min) => `Password must be at least ${min} characters`,
      passwordMoreNeeded: (remaining) =>
        `${remaining} more ${plural("en", remaining, { one: "character", other: "characters" })} needed`,
      confirmRequired: "Please confirm your password",
      passwordsDiffer: "Passwords do not match",
    },
    signIn: {
      pageTitle: "Sign in",
      heading: "Welcome back",
      description: "Let's log in to the system",
      submit: "Sign in",
      pending: "Signing in...",
      noAccount: "Don't have an account?",
      signUpLink: "Sign up",
    },
    signUp: {
      pageTitle: "Sign up",
      heading: "Get started",
      description: "Let's set up your account",
      submit: "Create account",
      pending: "Creating account...",
      haveAccount: "Already have an account?",
      signInLink: "Sign in",
    },
    confirmEmail: {
      registered: {
        heading: "Registration successful",
        description: "Your account has been created. You can now sign in.",
        link: "Go to sign in",
      },
      checkInbox: {
        heading: "Check your email",
        description: "We've sent a confirmation link to your email address. Click it to activate your account.",
        link: "Back to sign in",
      },
    },
    errors: {
      invalidCredentials: "Invalid email or password",
      alreadyRegistered: "An account with this email already exists",
      weakPassword: "That password is too weak. Choose a longer one that is harder to guess",
      invalidEmail: "That email address is not valid",
      tooManyRequests: "Too many attempts. Please try again in a moment",
      emailNotConfirmed: "Confirm your email address before signing in",
      signupDisabled: "Sign-up is currently disabled",
      notConfigured: "Supabase is not configured — signing in is disabled",
      generic: "Something went wrong. Please try again",
    },
  },
  profile: {
    pageTitle: "Your profile",
    heading: "Your profile",
    saved: "Profile saved.",
    name: "Name",
    namePlaceholder: "How the group knows you",
    nameHint: (max) => `Shown on the sign-up lists. At most ${max} characters.`,
    primaryPosition: "Primary position",
    secondaryPosition: "Secondary position",
    noPosition: "No position",
    secondaryHint: "Optional. Pick a primary position first.",
    submit: "Update",
    pending: "Saving…",
    unavailable: {
      loadFailed: "Could not load your profile. Please try again in a moment.",
      missing: "Your profile is missing. Sign out and back in, then try again.",
    },
    errors: {
      missingNickname: "Name is required",
      nicknameTooLong: (max) => `Name can be at most ${max} characters`,
      invalidPosition: "Pick a position from the list",
      secondaryWithoutPrimary: "Choose a primary position before a secondary one",
      secondaryEqualsPrimary: "Secondary position must differ from primary",
      notFound: "Profile not found",
      saveFailed: "Could not save your profile. Please try again.",
    },
  },
  home: {
    heading: "Volleyball trainings, one tap to sign up.",
    lead: "FullRotation keeps the group's weekly sessions in one place: who's in, who's on the waitlist, and whether the hall is on.",
    goToDashboard: "Go to dashboard",
    signIn: "Sign in",
    createAccount: "Create account",
    howItWorks: "How it works",
    features: {
      signUp: {
        title: "Sign up from the link",
        text: "Open the training link from the group chat and take a spot in one tap.",
      },
      whoIsIn: {
        title: "See who's in",
        text: "The main list holds 12. After that you join the waitlist and move up when someone drops out.",
      },
      decided: {
        title: "On or off, decided for you",
        text: "Sign-ups close 3 hours before. With 10 or more the training is on; with fewer it's called off.",
      },
    },
  },
  dashboard: {
    pageTitle: "Dashboard",
    heading: "Dashboard",
    hint: "Open a training from the link the organizer shares in the group chat.",
    profile: "Your profile",
    organizer: "Organizer: trainings",
    signOut: "Sign out",
  },
  training: {
    status: {
      open: "Sign-ups open",
      finalizing: "Finalizing",
      confirmed: "Confirmed",
      cancelled: "Cancelled",
    },
    unavailable: {
      loadFailedTitle: "Could not load this training",
      loadFailedMessage: "Something went wrong. Please try again in a moment.",
      notFoundTitle: "Training not found",
      notFoundMessage: "This training doesn't exist or the link is wrong.",
    },
    details: {
      start: "Start",
      location: "Location",
      note: "Note",
      signups: "Sign-ups",
      signupsOpenUntil: (when) => `Sign-ups open until ${when}`,
      signupsClosed: "Sign-ups are closed",
    },
    errors: {
      missingTitle: "Title is required",
      titleTooLong: (max) => `Title can be at most ${max} characters`,
      missingLocation: "Location is required",
      locationTooLong: (max) => `Location can be at most ${max} characters`,
      noteTooLong: (max) => `Note can be at most ${max} characters`,
      invalidStart: "Enter a valid start date and time",
      startsTooSoon: (hours) =>
        `The training must start more than ${hours} ${plural("en", hours, { one: "hour", other: "hours" })} from now`,
      signupClosed: "Sign-ups for this training are closed; it can no longer be edited",
      notFound: "Training not found",
      saveFailed: "Could not save the training. Please try again.",
    },
  },
  signup: {
    notice: {
      signedUp: "You're signed up.",
      withdrawn: "You've withdrawn your sign-up.",
    },
    mainList: "Main list",
    waitlist: "Waitlist",
    youAreIn: "You're in.",
    youWillMoveUp: "You'll move up if someone withdraws.",
    spotsLeft: (free, size) => `${free} of ${size} spots left on the main list.`,
    mainFull: "The main list is full — signing up now puts you on the waitlist.",
    signUp: "Sign up",
    withdraw: "Withdraw",
    lateWithdrawNote: "Sign-ups are closed. Withdrawing now may count as an absence.",
    emptyMain: "Nobody has signed up yet.",
    emptyWaitlist: "Nobody is waiting.",
    you: "you",
    manage: "Manage",
    rosterUnavailable: "Could not load who's signed up. Please try again in a moment.",
    blockReason: (absences, window) =>
      `You can't sign up for this training: ${absences} ${plural("en", absences, { one: "absence", other: "absences" })} in your last ${window} sessions. Sit this one out and you'll be able to sign up again.`,
    errors: {
      signupClosed: "Sign-ups for this training are closed",
      alreadySignedUp: "You are already signed up for this training",
      overlappingSignup: (minutes) =>
        `You are already signed up for another training starting within ${minutes} minutes of this one`,
      playerBlocked: "You can't sign up for this training",
      notSignedUp: "You are not signed up for this training",
      notFound: "Training not found",
      saveFailed: "Something went wrong. Please try again.",
    },
  },
  forbidden: {
    title: "Organizers only",
    description: "This area is available to organizer accounts only.",
    back: "Back to dashboard",
  },
};
