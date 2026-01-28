import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";
import { SettingsNavigation } from "#/components/features/settings/settings-navigation";
import { organizationService } from "#/api/organization-service/organization-service.api";
import OptionService from "#/api/option-service/option-service.api";
import { OrganizationMember } from "#/types/org";
import { useSelectedOrganizationStore } from "#/stores/selected-organization-store";
import { SAAS_NAV_ITEMS } from "#/constants/settings-nav";

vi.mock("react-router", async () => ({
  ...(await vi.importActual("react-router")),
  useRevalidator: () => ({ revalidate: vi.fn() }),
}));

const mockConfig = () => {
  vi.spyOn(OptionService, "getConfig").mockResolvedValue({
    APP_MODE: "saas",
  } as Awaited<ReturnType<typeof OptionService.getConfig>>);
};

const createMockUser = (
  overrides: Partial<OrganizationMember> = {},
): OrganizationMember => ({
  org_id: "org-1",
  user_id: "user-1",
  email: "test@example.com",
  role: "member",
  llm_api_key: "",
  max_iterations: 100,
  llm_model: "gpt-4",
  llm_api_key_for_byor: null,
  llm_base_url: "",
  status: "active",
  ...overrides,
});

const seedActiveUser = (user: Partial<OrganizationMember>) => {
  mockConfig();
  useSelectedOrganizationStore.setState({ organizationId: "org-1" });
  vi.spyOn(organizationService, "getMe").mockResolvedValue(
    createMockUser(user),
  );
};

const renderSettingsNavigation = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettingsNavigation
          isMobileMenuOpen={false}
          onCloseMobileMenu={vi.fn()}
          navigationItems={SAAS_NAV_ITEMS}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("SettingsNavigation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSelectedOrganizationStore.setState({ organizationId: null });
  });

  describe("org route visibility based on permissions", () => {
    it("should hide org routes for members (no view_billing or invite_user_to_organization permissions)", async () => {
      seedActiveUser({ role: "member" });
      renderSettingsNavigation();

      // Wait for the component to render with user data and filtering to apply
      await screen.findByTestId("settings-navbar");

      // Wait for the user query to complete and the component to re-render
      await waitFor(() => {
        // Member should NOT see org routes
        const orgMembersLink = screen.queryByText("Organization Members");
        const orgLink = screen.queryByText("Organization");

        expect(orgMembersLink).not.toBeInTheDocument();
        expect(orgLink).not.toBeInTheDocument();
      });
    });

    it("should show org routes for admins (has view_billing and invite_user_to_organization permissions)", async () => {
      seedActiveUser({ role: "admin" });
      renderSettingsNavigation();

      // Wait for the component to render with user data
      await screen.findByTestId("settings-navbar");

      // Admin should see org routes
      const orgMembersLink = await screen.findByText("Organization Members");
      const orgLink = await screen.findByText("Organization");

      expect(orgMembersLink).toBeInTheDocument();
      expect(orgLink).toBeInTheDocument();
    });

    it("should show org routes for owners (has view_billing and invite_user_to_organization permissions)", async () => {
      seedActiveUser({ role: "owner" });
      renderSettingsNavigation();

      // Wait for the component to render with user data
      await screen.findByTestId("settings-navbar");

      // Owner should see org routes
      const orgMembersLink = await screen.findByText("Organization Members");
      const orgLink = await screen.findByText("Organization");

      expect(orgMembersLink).toBeInTheDocument();
      expect(orgLink).toBeInTheDocument();
    });

    it("should hide org routes when no organization is selected, regardless of role", async () => {
      // Set up config but don't set organizationId
      mockConfig();
      vi.spyOn(organizationService, "getMe").mockResolvedValue(
        createMockUser({ role: "admin" }),
      );
      // Keep organizationId as null (not set)
      useSelectedOrganizationStore.setState({ organizationId: null });

      renderSettingsNavigation();

      // Wait for the component to render
      await screen.findByTestId("settings-navbar");

      // Even admin should NOT see org routes when no org is selected
      const orgMembersLink = screen.queryByText("Organization Members");
      const orgLink = screen.queryByText("Organization");

      expect(orgMembersLink).not.toBeInTheDocument();
      expect(orgLink).not.toBeInTheDocument();
    });
  });
});
