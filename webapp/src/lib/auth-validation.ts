export const PASSWORD_MIN_LENGTH = 8;

export type LoginBody = {
  email?: unknown;
  password?: unknown;
};

export type SignupBody = {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  confirmPassword?: unknown;
  acceptedTerms?: unknown;
};

export type LoginFieldErrors = Partial<Record<"email" | "password", string>>;
export type SignupFieldErrors = Partial<
  Record<"fullName" | "email" | "password" | "confirmPassword" | "acceptedTerms", string>
>;

type LoginPayload =
  | {
      ok: true;
      data: {
        email: string;
        password: string;
      };
    }
  | {
      ok: false;
      fieldErrors: LoginFieldErrors;
    };

type SignupPayload =
  | {
      ok: true;
      data: {
        email: string;
        password: string;
        fullName: string;
        acceptedTerms: true;
      };
    }
  | {
      ok: false;
      fieldErrors: SignupFieldErrors;
    };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeFullName(fullName: string) {
  return fullName.trim().replace(/\s+/g, " ");
}

export function validateEmail(email: string) {
  if (!email) {
    return "Enter your email address.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address.";
  }

  return null;
}

export function validateFullName(fullName: string) {
  if (!fullName) {
    return "Enter your full name.";
  }

  if (fullName.length < 2) {
    return "Full name must be at least 2 characters.";
  }

  if (fullName.length > 80) {
    return "Full name must be 80 characters or fewer.";
  }

  return null;
}

export function validatePassword(password: string) {
  if (!password) {
    return "Enter your password.";
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Include at least one letter and one number.";
  }

  return null;
}

export function validateLoginPayload(body: LoginBody): LoginPayload {
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fieldErrors: LoginFieldErrors = {};

  const emailError = validateEmail(email);
  if (emailError) {
    fieldErrors.email = emailError;
  }

  if (!password.trim()) {
    fieldErrors.password = "Enter your password.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
    };
  }

  return {
    ok: true,
    data: {
      email,
      password,
    },
  };
}

export function validateSignupPayload(body: SignupBody): SignupPayload {
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName =
    typeof body.fullName === "string" ? normalizeFullName(body.fullName) : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  const acceptedTerms = body.acceptedTerms === true;
  const fieldErrors: SignupFieldErrors = {};

  const emailError = validateEmail(email);
  if (emailError) {
    fieldErrors.email = emailError;
  }

  const fullNameError = validateFullName(fullName);
  if (fullNameError) {
    fieldErrors.fullName = fullNameError;
  }

  if (!password.trim()) {
    fieldErrors.password = "Enter your password.";
  } else {
    const passwordError = validatePassword(password);
    if (passwordError) {
      fieldErrors.password = passwordError;
    }
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = "Confirm your password.";
  } else if (confirmPassword !== password) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }

  if (!acceptedTerms) {
    fieldErrors.acceptedTerms = "You must accept the legal terms to create an account.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
    };
  }

  return {
    ok: true,
    data: {
      email,
      password,
      fullName,
      acceptedTerms: true,
    },
  };
}
