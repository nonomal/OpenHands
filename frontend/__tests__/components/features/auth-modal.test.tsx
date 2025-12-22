import { screen, waitFor } from "@testing-library/react";
import { it, describe, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import React from "react";
import { AuthModal } from "#/components/features/waitlist/auth-modal";
import AuthService from "#/api/auth-service/auth-service.api";
import { renderWithProviders } from "test-utils";

// Mock the useAuthUrl hook
vi.mock("#/hooks/use-auth-url", () => ({
  useAuthUrl: () => "https://gitlab.com/oauth/authorize",
}));

// Mock the useTracking hook
vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({
    trackLoginButtonClick: vi.fn(),
  }),
}));

// Minimal mock for react-google-recaptcha - just expose executeAsync via ref
type RecaptchaHandle = {
  executeAsync: () => Promise<string | null>;
  reset: () => void;
};
type RecaptchaProps = { sitekey: string; size: string; onError: () => void };

const mockExecuteAsync = vi.hoisted(() =>
  vi.fn<RecaptchaHandle["executeAsync"]>().mockResolvedValue("mock-token"),
);

vi.mock("react-google-recaptcha", () => {
  return {
    __esModule: true,
    default: React.forwardRef<RecaptchaHandle, RecaptchaProps>((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        executeAsync: mockExecuteAsync,
        reset: vi.fn(),
      }));
      return React.createElement("div", {
        "data-testid": "recaptcha-widget",
        "data-sitekey": props.sitekey,
        "data-size": props.size,
      });
    }),
  };
});

describe("AuthModal", () => {
  let verifyRecaptchaSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("location", { href: "" });
    verifyRecaptchaSpy = vi.spyOn(AuthService, "verifyRecaptcha");
    mockExecuteAsync.mockResolvedValue("mock-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("should render the GitHub and GitLab buttons", () => {
    renderWithProviders(
      <AuthModal
        githubAuthUrl="mock-url"
        appMode="saas"
        providersConfigured={["github", "gitlab"]}
      />,
    );

    const githubButton = screen.getByRole("button", {
      name: "GITHUB$CONNECT_TO_GITHUB",
    });
    const gitlabButton = screen.getByRole("button", {
      name: "GITLAB$CONNECT_TO_GITLAB",
    });

    expect(githubButton).toBeInTheDocument();
    expect(gitlabButton).toBeInTheDocument();
  });

  it("should redirect to GitHub auth URL when GitHub button is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    vi.stubEnv("VITE_RECAPTCHA_SITE_KEY", undefined);
    const mockUrl = "https://github.com/login/oauth/authorize";
    renderWithProviders(
      <AuthModal
        githubAuthUrl={mockUrl}
        appMode="saas"
        providersConfigured={["github"]}
      />,
    );

    // Act
    const githubButton = screen.getByRole("button", {
      name: "GITHUB$CONNECT_TO_GITHUB",
    });
    await user.click(githubButton);

    // Assert
    expect(window.location.href).toBe(mockUrl);
  });

  it("should render Terms of Service and Privacy Policy text with correct links", () => {
    renderWithProviders(<AuthModal githubAuthUrl="mock-url" appMode="saas" />);

    // Find the terms of service section using data-testid
    const termsSection = screen.getByTestId("auth-modal-terms-of-service");
    expect(termsSection).toBeInTheDocument();

    // Check that all text content is present in the paragraph
    expect(termsSection).toHaveTextContent(
      "AUTH$BY_SIGNING_UP_YOU_AGREE_TO_OUR",
    );
    expect(termsSection).toHaveTextContent("COMMON$TERMS_OF_SERVICE");
    expect(termsSection).toHaveTextContent("COMMON$AND");
    expect(termsSection).toHaveTextContent("COMMON$PRIVACY_POLICY");

    // Check Terms of Service link
    const tosLink = screen.getByRole("link", {
      name: "COMMON$TERMS_OF_SERVICE",
    });
    expect(tosLink).toBeInTheDocument();
    expect(tosLink).toHaveAttribute("href", "https://www.all-hands.dev/tos");
    expect(tosLink).toHaveAttribute("target", "_blank");
    expect(tosLink).toHaveClass("underline", "hover:text-primary");

    // Check Privacy Policy link
    const privacyLink = screen.getByRole("link", {
      name: "COMMON$PRIVACY_POLICY",
    });
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink).toHaveAttribute(
      "href",
      "https://www.all-hands.dev/privacy",
    );
    expect(privacyLink).toHaveAttribute("target", "_blank");
    expect(privacyLink).toHaveClass("underline", "hover:text-primary");

    // Verify that both links are within the terms section
    expect(termsSection).toContainElement(tosLink);
    expect(termsSection).toContainElement(privacyLink);
  });

  it("should open Terms of Service link in new tab", () => {
    renderWithProviders(<AuthModal githubAuthUrl="mock-url" appMode="saas" />);

    const tosLink = screen.getByRole("link", {
      name: "COMMON$TERMS_OF_SERVICE",
    });
    expect(tosLink).toHaveAttribute("target", "_blank");
  });

  it("should open Privacy Policy link in new tab", () => {
    renderWithProviders(<AuthModal githubAuthUrl="mock-url" appMode="saas" />);

    const privacyLink = screen.getByRole("link", {
      name: "COMMON$PRIVACY_POLICY",
    });
    expect(privacyLink).toHaveAttribute("target", "_blank");
  });

  describe("reCAPTCHA integration", () => {
    it("should allow auth when reCAPTCHA is not configured", async () => {
      // Arrange
      const user = userEvent.setup();
      vi.stubEnv("VITE_RECAPTCHA_SITE_KEY", undefined);
      const mockUrl = "https://github.com/login/oauth/authorize";

      renderWithProviders(
        <AuthModal
          githubAuthUrl={mockUrl}
          appMode="saas"
          providersConfigured={["github"]}
        />,
      );

      // Act
      const githubButton = screen.getByRole("button", {
        name: "GITHUB$CONNECT_TO_GITHUB",
      });
      await user.click(githubButton);

      // Assert
      expect(window.location.href).toBe(mockUrl);
      expect(verifyRecaptchaSpy).not.toHaveBeenCalled();
    });

    it("should block auth and show error when reCAPTCHA execution returns no token", async () => {
      // Arrange
      const user = userEvent.setup();
      vi.stubEnv("VITE_RECAPTCHA_SITE_KEY", "test-site-key");
      const mockUrl = "https://github.com/login/oauth/authorize";
      mockExecuteAsync.mockResolvedValue(null);

      renderWithProviders(
        <AuthModal
          githubAuthUrl={mockUrl}
          appMode="saas"
          providersConfigured={["github"]}
        />,
      );

      // Act
      const githubButton = screen.getByRole("button", {
        name: "GITHUB$CONNECT_TO_GITHUB",
      });
      await user.click(githubButton);

      // Assert
      await waitFor(() => {
        expect(window.location.href).toBe("");
      });
      expect(screen.getByText(/AUTH\$RECAPTCHA_REQUIRED/i)).toBeInTheDocument();
      expect(verifyRecaptchaSpy).not.toHaveBeenCalled();
    });

    it("should block auth when reCAPTCHA verification fails", async () => {
      // Arrange
      const user = userEvent.setup();
      vi.stubEnv("VITE_RECAPTCHA_SITE_KEY", "test-site-key");
      const mockUrl = "https://github.com/login/oauth/authorize";
      const mockToken = "recaptcha-token-123";
      mockExecuteAsync.mockResolvedValue(mockToken);
      verifyRecaptchaSpy.mockResolvedValue({ success: false });

      renderWithProviders(
        <AuthModal
          githubAuthUrl={mockUrl}
          appMode="saas"
          providersConfigured={["github"]}
        />,
      );

      // Act
      const githubButton = screen.getByRole("button", {
        name: "GITHUB$CONNECT_TO_GITHUB",
      });
      await user.click(githubButton);

      // Assert
      await waitFor(() => {
        expect(window.location.href).toBe("");
      });
      expect(screen.getByText(/AUTH\$RECAPTCHA_REQUIRED/i)).toBeInTheDocument();
      expect(verifyRecaptchaSpy).toHaveBeenCalledWith(mockToken);
    });

    it("should allow auth when reCAPTCHA verification succeeds", async () => {
      // Arrange
      const user = userEvent.setup();
      vi.stubEnv("VITE_RECAPTCHA_SITE_KEY", "test-site-key");
      const mockUrl = "https://github.com/login/oauth/authorize";
      const mockToken = "recaptcha-token-123";
      mockExecuteAsync.mockResolvedValue(mockToken);
      verifyRecaptchaSpy.mockResolvedValue({ success: true });

      renderWithProviders(
        <AuthModal
          githubAuthUrl={mockUrl}
          appMode="saas"
          providersConfigured={["github"]}
        />,
      );

      // Act
      const githubButton = screen.getByRole("button", {
        name: "GITHUB$CONNECT_TO_GITHUB",
      });
      await user.click(githubButton);

      // Assert
      await waitFor(() => {
        expect(window.location.href).toBe(mockUrl);
      });
      expect(verifyRecaptchaSpy).toHaveBeenCalledWith(mockToken);
      expect(
        screen.queryByText(/AUTH\$RECAPTCHA_REQUIRED/i),
      ).not.toBeInTheDocument();
    });

    it("should render reCAPTCHA widget when site key is configured", () => {
      // Arrange
      vi.stubEnv("VITE_RECAPTCHA_SITE_KEY", "test-site-key");

      // Act
      renderWithProviders(
        <AuthModal
          githubAuthUrl="mock-url"
          appMode="saas"
          providersConfigured={["github"]}
        />,
      );

      // Assert
      expect(screen.getByTestId("recaptcha-widget")).toBeInTheDocument();
    });

    it("should not render reCAPTCHA widget when site key is not configured", () => {
      // Arrange
      vi.stubEnv("VITE_RECAPTCHA_SITE_KEY", undefined);

      // Act
      renderWithProviders(
        <AuthModal
          githubAuthUrl="mock-url"
          appMode="saas"
          providersConfigured={["github"]}
        />,
      );

      // Assert
      expect(screen.queryByTestId("recaptcha-widget")).not.toBeInTheDocument();
    });
  });
});
