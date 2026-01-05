import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import ReCAPTCHA from "react-google-recaptcha";
import { I18nKey } from "#/i18n/declaration";
import OpenHandsLogo from "#/assets/branding/openhands-logo.svg?react";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { BrandButton } from "../settings/brand-button";
import GitHubLogo from "#/assets/branding/github-logo.svg?react";
import GitLabLogo from "#/assets/branding/gitlab-logo.svg?react";
import BitbucketLogo from "#/assets/branding/bitbucket-logo.svg?react";
import AzureDevOpsLogo from "#/assets/branding/azure-devops-logo.svg?react";
import { useAuthUrl } from "#/hooks/use-auth-url";
import { GetConfigResponse } from "#/api/option-service/option.types";
import { Provider } from "#/types/settings";
import { useTracking } from "#/hooks/use-tracking";
import { useVerifyRecaptcha } from "#/hooks/mutation/use-verify-recaptcha";
import { TermsAndPrivacyNotice } from "#/components/shared/terms-and-privacy-notice";

interface AuthModalProps {
  githubAuthUrl: string | null;
  appMode?: GetConfigResponse["APP_MODE"] | null;
  authUrl?: GetConfigResponse["AUTH_URL"];
  providersConfigured?: Provider[];
  emailVerified?: boolean;
  hasDuplicatedEmail?: boolean;
}

export function AuthModal({
  githubAuthUrl,
  appMode,
  authUrl,
  providersConfigured,
  emailVerified = false,
  hasDuplicatedEmail = false,
}: AuthModalProps) {
  const { t } = useTranslation();
  const { trackLoginButtonClick } = useTracking();
  const [recaptchaError, setRecaptchaError] = useState(false);
  const recaptchaRef = useRef<ReCAPTCHA>(null);

  // Get reCAPTCHA site key from environment variable
  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || undefined;

  // Hook for verifying reCAPTCHA with backend
  const { mutateAsync: verifyRecaptcha } = useVerifyRecaptcha();

  const gitlabAuthUrl = useAuthUrl({
    appMode: appMode || null,
    identityProvider: "gitlab",
    authUrl,
  });

  const bitbucketAuthUrl = useAuthUrl({
    appMode: appMode || null,
    identityProvider: "bitbucket",
    authUrl,
  });

  const azureDevOpsAuthUrl = useAuthUrl({
    appMode: appMode || null,
    identityProvider: "azure_devops",
    authUrl,
  });

  const enterpriseSsoUrl = useAuthUrl({
    appMode: appMode || null,
    identityProvider: "enterprise_sso",
    authUrl,
  });

  // Validate reCAPTCHA before proceeding with auth
  const validateRecaptcha = async (): Promise<boolean> => {
    if (!recaptchaSiteKey) {
      // If reCAPTCHA is not configured, allow auth to proceed
      return true;
    }

    if (!recaptchaRef.current) {
      setRecaptchaError(true);
      return false;
    }

    // For invisible reCAPTCHA, execute the challenge first
    try {
      const token = await recaptchaRef.current.executeAsync();
      if (!token) {
        setRecaptchaError(true);
        return false;
      }

      // Verify the token with the backend using the mutation hook
      const verificationResult = await verifyRecaptcha(token);
      if (!verificationResult.success) {
        setRecaptchaError(true);
        return false;
      }

      setRecaptchaError(false);
      return true;
    } catch (error) {
      // Log error to console for debugging
      console.error("reCAPTCHA verification failed", error);
      setRecaptchaError(true);
      return false;
    }
  };

  const handleGitHubAuth = async () => {
    const hasCaptchaVerified = await validateRecaptcha();
    if (!hasCaptchaVerified) {
      return;
    }

    if (githubAuthUrl) {
      trackLoginButtonClick({ provider: "github" });
      // Always start the OIDC flow, let the backend handle TOS check
      window.location.href = githubAuthUrl;
    }
  };

  const handleGitLabAuth = async () => {
    const hasCaptchaVerified = await validateRecaptcha();
    if (!hasCaptchaVerified) {
      return;
    }

    if (gitlabAuthUrl) {
      trackLoginButtonClick({ provider: "gitlab" });
      // Always start the OIDC flow, let the backend handle TOS check
      window.location.href = gitlabAuthUrl;
    }
  };

  const handleBitbucketAuth = async () => {
    const hasCaptchaVerified = await validateRecaptcha();
    if (!hasCaptchaVerified) {
      return;
    }

    if (bitbucketAuthUrl) {
      trackLoginButtonClick({ provider: "bitbucket" });
      // Always start the OIDC flow, let the backend handle TOS check
      window.location.href = bitbucketAuthUrl;
    }
  };

  const handleAzureDevOpsAuth = async () => {
    const hasCaptchaVerified = await validateRecaptcha();
    if (!hasCaptchaVerified) {
      return;
    }

    if (azureDevOpsAuthUrl) {
      // Always start the OIDC flow, let the backend handle TOS check
      window.location.href = azureDevOpsAuthUrl;
    }
  };

  const handleEnterpriseSsoAuth = async () => {
    const hasCaptchaVerified = await validateRecaptcha();
    if (!hasCaptchaVerified) {
      return;
    }

    if (enterpriseSsoUrl) {
      trackLoginButtonClick({ provider: "enterprise_sso" });
      // Always start the OIDC flow, let the backend handle TOS check
      window.location.href = enterpriseSsoUrl;
    }
  };

  // Only show buttons if providers are configured and include the specific provider
  const showGithub =
    providersConfigured &&
    providersConfigured.length > 0 &&
    providersConfigured.includes("github");
  const showGitlab =
    providersConfigured &&
    providersConfigured.length > 0 &&
    providersConfigured.includes("gitlab");
  const showBitbucket =
    providersConfigured &&
    providersConfigured.length > 0 &&
    providersConfigured.includes("bitbucket");
  const showAzureDevOps =
    providersConfigured &&
    providersConfigured.length > 0 &&
    providersConfigured.includes("azure_devops");
  const showEnterpriseSso =
    providersConfigured &&
    providersConfigured.length > 0 &&
    providersConfigured.includes("enterprise_sso");

  // Check if no providers are configured
  const noProvidersConfigured =
    !providersConfigured || providersConfigured.length === 0;

  return (
    <ModalBackdrop>
      <ModalBody className="border border-tertiary">
        <OpenHandsLogo width={68} height={46} />
        {recaptchaError && (
          <div className="text-center text-danger text-sm mt-2 mb-2">
            {t(I18nKey.AUTH$RECAPTCHA_REQUIRED)}
          </div>
        )}
        {emailVerified && (
          <div className="flex flex-col gap-2 w-full items-center text-center">
            <p className="text-sm text-muted-foreground">
              {t(I18nKey.AUTH$EMAIL_VERIFIED_PLEASE_LOGIN)}
            </p>
          </div>
        )}
        {hasDuplicatedEmail && (
          <div className="text-center text-danger text-sm mt-2 mb-2">
            {t(I18nKey.AUTH$DUPLICATE_EMAIL_ERROR)}
          </div>
        )}
        <div className="flex flex-col gap-2 w-full items-center text-center">
          <h1 className="text-2xl font-bold">
            {t(I18nKey.AUTH$SIGN_IN_WITH_IDENTITY_PROVIDER)}
          </h1>
        </div>

        <div className="flex flex-col gap-3 w-full">
          {noProvidersConfigured ? (
            <div className="text-center p-4 text-muted-foreground">
              {t(I18nKey.AUTH$NO_PROVIDERS_CONFIGURED)}
            </div>
          ) : (
            <>
              {showGithub && (
                <BrandButton
                  type="button"
                  variant="primary"
                  onClick={handleGitHubAuth}
                  className="w-full font-semibold"
                  startContent={<GitHubLogo width={20} height={20} />}
                >
                  {t(I18nKey.GITHUB$CONNECT_TO_GITHUB)}
                </BrandButton>
              )}

              {showGitlab && (
                <BrandButton
                  type="button"
                  variant="primary"
                  onClick={handleGitLabAuth}
                  className="w-full font-semibold"
                  startContent={<GitLabLogo width={20} height={20} />}
                >
                  {t(I18nKey.GITLAB$CONNECT_TO_GITLAB)}
                </BrandButton>
              )}

              {showBitbucket && (
                <BrandButton
                  type="button"
                  variant="primary"
                  onClick={handleBitbucketAuth}
                  className="w-full font-semibold"
                  startContent={<BitbucketLogo width={20} height={20} />}
                >
                  {t(I18nKey.BITBUCKET$CONNECT_TO_BITBUCKET)}
                </BrandButton>
              )}

              {showAzureDevOps && (
                <BrandButton
                  type="button"
                  variant="primary"
                  onClick={handleAzureDevOpsAuth}
                  className="w-full font-semibold"
                  startContent={<AzureDevOpsLogo width={20} height={20} />}
                >
                  {t(I18nKey.AZURE_DEVOPS$CONNECT_ACCOUNT)}
                </BrandButton>
              )}

              {showEnterpriseSso && (
                <BrandButton
                  type="button"
                  variant="primary"
                  onClick={handleEnterpriseSsoAuth}
                  className="w-full font-semibold"
                >
                  {t(I18nKey.ENTERPRISE_SSO$CONNECT_TO_ENTERPRISE_SSO)}
                </BrandButton>
              )}

              {recaptchaSiteKey && (
                <div className="flex justify-center mt-2">
                  <ReCAPTCHA
                    ref={recaptchaRef}
                    sitekey={recaptchaSiteKey}
                    size="invisible"
                    onError={() => {
                      setRecaptchaError(true);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <TermsAndPrivacyNotice />
      </ModalBody>
    </ModalBackdrop>
  );
}
