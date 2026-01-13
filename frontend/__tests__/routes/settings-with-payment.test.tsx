import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoutesStub } from "react-router";
import { renderWithProviders } from "test-utils";
import SettingsScreen from "#/routes/settings";
import { PaymentForm } from "#/components/features/payment/payment-form";
import { QueryClient } from "@tanstack/react-query";
import * as PermissionChecksModule from "#/utils/org/permission-checks";

let queryClient: QueryClient;

// Mock the useSettings hook
vi.mock("#/hooks/query/use-settings", async () => {
  const actual = await vi.importActual<typeof import("#/hooks/query/use-settings")>(
    "#/hooks/query/use-settings"
  );
  return {
    ...actual,
    useSettings: vi.fn().mockReturnValue({
      data: { EMAIL_VERIFIED: true },
      isLoading: false,
    }),
  };
});

// Mock the i18next hook
vi.mock("react-i18next", async () => {
  const actual =
    await vi.importActual<typeof import("react-i18next")>("react-i18next");
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const translations: Record<string, string> = {
          SETTINGS$NAV_INTEGRATIONS: "Integrations",
          SETTINGS$NAV_APPLICATION: "Application",
          SETTINGS$NAV_CREDITS: "Credits",
          SETTINGS$NAV_BILLING: "Billing",
          SETTINGS$NAV_API_KEYS: "API Keys",
          SETTINGS$NAV_LLM: "LLM",
          SETTINGS$NAV_USER: "User",
          SETTINGS$NAV_SECRETS: "Secrets",
          SETTINGS$NAV_MCP: "MCP",
          SETTINGS$TITLE: "Settings",
        };
        return translations[key] || key;
      },
      i18n: {
        changeLanguage: vi.fn(),
      },
    }),
  };
});

// Mock useConfig hook
const { mockUseConfig } = vi.hoisted(() => ({
  mockUseConfig: vi.fn(),
}));
vi.mock("#/hooks/query/use-config", () => ({
  useConfig: mockUseConfig,
}));

describe("Settings Billing", () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.restoreAllMocks();

    // Seed initial config
    queryClient.setQueryData(["config"], {
      APP_MODE: "oss",
      FEATURE_FLAGS: { ENABLE_BILLING: false, HIDE_LLM_SETTINGS: false },
    });

    // Mock settings nav items based on current queryClient
    vi.mock("#/hooks/use-settings-nav-items", () => ({
      useSettingsNavItems: () => {
        const config = queryClient.getQueryData<{ APP_MODE: string; FEATURE_FLAGS?: any }>(["config"]);
        const isSaas = config?.APP_MODE === "saas";

        const items = [
          { to: "/settings/user", text: "User" },
          ...(isSaas ? [{ to: "/settings/billing", text: "Billing" }] : []),
          { to: "/settings/integrations", text: "Integrations" },
        ];

        return items;
      },
    }));
  });

  beforeEach(() => {
    // Set default config to OSS mode
    mockUseConfig.mockReturnValue({
      data: {
        APP_MODE: "oss",
        GITHUB_CLIENT_ID: "123",
        POSTHOG_CLIENT_KEY: "456",
        FEATURE_FLAGS: {
          ENABLE_BILLING: false,
          HIDE_LLM_SETTINGS: false,
          ENABLE_JIRA: false,
          ENABLE_JIRA_DC: false,
          ENABLE_LINEAR: false,
        },
      },
      isLoading: false,
    });
  });

  const RoutesStub = createRoutesStub([
    {
      Component: SettingsScreen,
      path: "/settings",
      children: [
        {
          Component: () => <PaymentForm />,
          path: "/settings/billing",
        },
        {
          Component: () => <div data-testid="git-settings-screen" />,
          path: "/settings/integrations",
        },
        {
          Component: () => <div data-testid="user-settings-screen" />,
          path: "/settings/user",
        },
      ],
    },
  ]);

  const renderSettingsScreen = () =>
    (renderWithProviders as unknown as (
      ui: React.ReactElement,
      options: { queryClient: QueryClient }
    ) => ReturnType<typeof renderWithProviders>)(
      <RoutesStub initialEntries={["/settings"]} />,
      { queryClient }
    );

  const seedConfig = (overrides = {}) => {
    queryClient.setQueryData(["config"], {
      APP_MODE: "saas",
      FEATURE_FLAGS: { ENABLE_BILLING: true, HIDE_LLM_SETTINGS: false },
      ...overrides,
    });
  };

  afterEach(() => vi.clearAllMocks());

  it("should not render the billing tab if OSS mode", async () => {
    // OSS mode is set by default in beforeEach
    vi.spyOn(
      PermissionChecksModule,
      "getActiveOrganizationUser",
      // @ts-expect-error - only return relevant data
    ).mockResolvedValue({
      user_id: "u1",
      role: "admin",
    });

    renderSettingsScreen();

    const navbar = await screen.findByTestId("settings-navbar");
    const credits = within(navbar).queryByText("Billing");
    expect(credits).not.toBeInTheDocument();
  });

  it("should render the billing tab if: SaaS mode, billing is enabled, and admin user", async () => {
    vi.spyOn(
      PermissionChecksModule,
      "getActiveOrganizationUser",
      // @ts-expect-error - only return relevant data
    ).mockResolvedValue({
      user_id: "u1",
      role: "admin",
    });

    seedConfig(); // Ensure SaaS mode

    renderSettingsScreen();

    const navbar = await screen.findByTestId("settings-navbar");
    within(navbar).getByText("Billing");
  });

  it("should NOT render the billing tab if: SaaS mode, billing is enabled, and member user", async () => {
    vi.spyOn(
      PermissionChecksModule,
      "getActiveOrganizationUser",
      // @ts-expect-error - only return relevant data
    ).mockResolvedValue({
      user_id: "u1",
      role: "member",
    });

    seedConfig(); // Ensure SaaS mode

    renderSettingsScreen();

    const navbar = await screen.findByTestId("settings-navbar");
    within(navbar).getByText("Billing");
  });

  it("should render the billing settings if clicking the billing item", async () => {
    const user = userEvent.setup();
    seedConfig(); // Ensure SaaS mode

    renderSettingsScreen();

    const navbar = await screen.findByTestId("settings-navbar");
    const credits = within(navbar).getByText("Billing");
    await user.click(credits);

    const billingSection = await screen.findByTestId("billing-settings");
    expect(billingSection).toBeInTheDocument();
  });
});
