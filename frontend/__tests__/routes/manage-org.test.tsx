import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { selectOrganization } from "test-utils";
import ManageOrg from "#/routes/manage-org";
import { organizationService } from "#/api/organization-service/organization-service.api";
import SettingsScreen, { clientLoader } from "#/routes/settings";
import { resetOrgMockData } from "#/mocks/org-handlers";
import OptionService from "#/api/option-service/option-service.api";
import BillingService from "#/api/billing-service/billing-service.api";

function ManageOrgWithPortalRoot() {
  return (
    <div>
      <ManageOrg />
      <div data-testid="portal-root" id="portal-root" />
    </div>
  );
}

const RouteStub = createRoutesStub([
  {
    Component: () => <div data-testid="home-screen" />,
    path: "/",
  },
  {
    // @ts-expect-error - type mismatch
    loader: clientLoader,
    Component: SettingsScreen,
    path: "/settings",
    HydrateFallback: () => <div>Loading...</div>,
    children: [
      {
        Component: ManageOrgWithPortalRoot,
        path: "/settings/org",
      },
    ],
  },
]);

const renderManageOrg = () =>
  render(<RouteStub initialEntries={["/settings/org"]} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    ),
  });

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock("react-router", async () => ({
  ...(await vi.importActual("react-router")),
  useNavigate: () => navigateMock,
}));

describe("Manage Org Route", () => {
  const getMeSpy = vi.spyOn(organizationService, "getMe");

  // Test data constants
  const TEST_USERS = {
    OWNER: {
      id: "1",
      email: "test@example.com",
      role: "owner" as const,
      status: "active" as const,
    },
    ADMIN: {
      id: "1",
      email: "test@example.com",
      role: "admin" as const,
      status: "active" as const,
    },
  };

  // Helper function to set up user mock
  const setupUserMock = (userData: {
    id: string;
    email: string;
    role: "owner" | "admin" | "user";
    status: "active" | "invited";
  }) => {
    getMeSpy.mockResolvedValue(userData);
  };

  beforeEach(() => {
    const getConfigSpy = vi.spyOn(OptionService, "getConfig");
    // @ts-expect-error - only return APP_MODE for these tests
    getConfigSpy.mockResolvedValue({
      APP_MODE: "saas",
    });

    // Set default mock for user (owner role has all permissions)
    setupUserMock(TEST_USERS.OWNER);
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Reset organization mock data to ensure clean state between tests
    resetOrgMockData();
  });

  it("should render the available credits", async () => {
    renderManageOrg();
    await screen.findByTestId("manage-org-screen");

    await selectOrganization({ orgIndex: 0 });

    await waitFor(() => {
      const credits = screen.getByTestId("available-credits");
      expect(credits).toHaveTextContent("1000");
    });
  });

  it("should render account details", async () => {
    renderManageOrg();

    await selectOrganization({ orgIndex: 0 });

    await waitFor(() => {
      const orgName = screen.getByTestId("org-name");
      expect(orgName).toHaveTextContent("Acme Corp");

      const billingInfo = screen.getByTestId("billing-info");
      expect(billingInfo).toHaveTextContent("**** **** **** 1234");
    });
  });

  it("should be able to add credits", async () => {
    const createCheckoutSessionSpy = vi.spyOn(
      BillingService,
      "createCheckoutSession",
    );

    renderManageOrg();
    await screen.findByTestId("manage-org-screen");

    await selectOrganization({ orgIndex: 0 }); // user is owner in org 1

    expect(screen.queryByTestId("add-credits-form")).not.toBeInTheDocument();
    // Simulate adding credits
    const addCreditsButton = screen.getByText(/add/i);
    await userEvent.click(addCreditsButton);

    const addCreditsForm = screen.getByTestId("add-credits-form");
    expect(addCreditsForm).toBeInTheDocument();

    const amountInput = within(addCreditsForm).getByTestId("amount-input");
    const nextButton = within(addCreditsForm).getByRole("button", {
      name: /next/i,
    });

    await userEvent.type(amountInput, "1000");
    await userEvent.click(nextButton);

    // expect redirect to payment page
    expect(createCheckoutSessionSpy).toHaveBeenCalledWith(1000);

    await waitFor(() =>
      expect(screen.queryByTestId("add-credits-form")).not.toBeInTheDocument(),
    );
  });

  it("should close the modal when clicking cancel", async () => {
    const createCheckoutSessionSpy = vi.spyOn(
      BillingService,
      "createCheckoutSession",
    );
    renderManageOrg();
    await screen.findByTestId("manage-org-screen");

    await selectOrganization({ orgIndex: 0 }); // user is owner in org 1

    expect(screen.queryByTestId("add-credits-form")).not.toBeInTheDocument();
    // Simulate adding credits
    const addCreditsButton = screen.getByText(/add/i);
    await userEvent.click(addCreditsButton);

    const addCreditsForm = screen.getByTestId("add-credits-form");
    expect(addCreditsForm).toBeInTheDocument();

    const cancelButton = within(addCreditsForm).getByRole("button", {
      name: /cancel/i,
    });

    await userEvent.click(cancelButton);

    expect(screen.queryByTestId("add-credits-form")).not.toBeInTheDocument();
    expect(createCheckoutSessionSpy).not.toHaveBeenCalled();
  });

  it("should show add credits option for ADMIN role", async () => {
    renderManageOrg();
    await screen.findByTestId("manage-org-screen");

    await selectOrganization({ orgIndex: 2 }); // user is admin in org 3

    // Verify credits are shown
    await waitFor(() => {
      const credits = screen.getByTestId("available-credits");
      expect(credits).toBeInTheDocument();
    });

    // Verify add credits button is present (admins can add credits)
    const addButton = screen.getByText(/add/i);
    expect(addButton).toBeInTheDocument();
  });

  describe("actions", () => {
    it("should be able to update the organization name", async () => {
      const updateOrgNameSpy = vi.spyOn(
        organizationService,
        "updateOrganization",
      );
      const getConfigSpy = vi.spyOn(OptionService, "getConfig");

      // @ts-expect-error - only return the properties we need for this test
      getConfigSpy.mockResolvedValue({
        APP_MODE: "saas", // required to enable getMe
      });

      renderManageOrg();
      await screen.findByTestId("manage-org-screen");

      await selectOrganization({ orgIndex: 0 });

      const orgName = screen.getByTestId("org-name");
      await waitFor(() => expect(orgName).toHaveTextContent("Acme Corp"));

      expect(
        screen.queryByTestId("update-org-name-form"),
      ).not.toBeInTheDocument();

      const changeOrgNameButton = within(orgName).getByRole("button", {
        name: /change/i,
      });
      await userEvent.click(changeOrgNameButton);

      const orgNameForm = screen.getByTestId("update-org-name-form");
      const orgNameInput = within(orgNameForm).getByRole("textbox");
      const saveButton = within(orgNameForm).getByRole("button", {
        name: /save/i,
      });

      await userEvent.type(orgNameInput, "New Org Name");
      await userEvent.click(saveButton);

      expect(updateOrgNameSpy).toHaveBeenCalledWith({
        orgId: "1",
        name: "New Org Name",
      });

      await waitFor(() => {
        expect(
          screen.queryByTestId("update-org-name-form"),
        ).not.toBeInTheDocument();
        expect(orgName).toHaveTextContent("New Org Name");
      });
    });

    it("should NOT allow roles other than owners to change org name", async () => {
      // Set admin role before rendering
      setupUserMock(TEST_USERS.ADMIN);

      renderManageOrg();
      await screen.findByTestId("manage-org-screen");

      await selectOrganization({ orgIndex: 2 }); // user is admin in org 3

      const orgName = screen.getByTestId("org-name");
      const changeOrgNameButton = within(orgName).queryByRole("button", {
        name: /change/i,
      });
      expect(changeOrgNameButton).not.toBeInTheDocument();
    });

    it("should NOT allow roles other than owners to delete an organization", async () => {
      setupUserMock(TEST_USERS.ADMIN);

      const getConfigSpy = vi.spyOn(OptionService, "getConfig");
      // @ts-expect-error - only return the properties we need for this test
      getConfigSpy.mockResolvedValue({
        APP_MODE: "saas", // required to enable getMe
      });

      renderManageOrg();
      await screen.findByTestId("manage-org-screen");

      await selectOrganization({ orgIndex: 2 }); // user is admin in org 3

      const deleteOrgButton = screen.queryByRole("button", {
        name: /ORG\$DELETE_ORGANIZATION/i,
      });
      expect(deleteOrgButton).not.toBeInTheDocument();
    });

    it("should be able to delete an organization", async () => {
      const deleteOrgSpy = vi.spyOn(organizationService, "deleteOrganization");

      renderManageOrg();
      await screen.findByTestId("manage-org-screen");

      await selectOrganization({ orgIndex: 0 });

      expect(
        screen.queryByTestId("delete-org-confirmation"),
      ).not.toBeInTheDocument();

      const deleteOrgButton = screen.getByRole("button", {
        name: /ORG\$DELETE_ORGANIZATION/i,
      });
      await userEvent.click(deleteOrgButton);

      const deleteConfirmation = screen.getByTestId("delete-org-confirmation");
      const confirmButton = within(deleteConfirmation).getByRole("button", {
        name: /BUTTON\$CONFIRM/i,
      });

      await userEvent.click(confirmButton);

      expect(deleteOrgSpy).toHaveBeenCalledWith({ orgId: "1" });
      expect(
        screen.queryByTestId("delete-org-confirmation"),
      ).not.toBeInTheDocument();

      // expect to have navigated to home screen
      await screen.findByTestId("home-screen");
    });

    it.todo("should be able to update the organization billing info");
  });

  describe("Role-based delete organization permission behavior", () => {
    it("should show delete organization button when user has canDeleteOrganization permission (Owner role)", async () => {
      setupUserMock(TEST_USERS.OWNER);

      renderManageOrg();
      await screen.findByTestId("manage-org-screen");

      await selectOrganization({ orgIndex: 0 });

      const deleteButton = await screen.findByRole("button", {
        name: /ORG\$DELETE_ORGANIZATION/i,
      });

      expect(deleteButton).toBeInTheDocument();
      expect(deleteButton).not.toBeDisabled();
    });

    it.each([
      { role: "admin" as const, roleName: "Admin" },
      { role: "user" as const, roleName: "User" },
    ])(
      "should not show delete organization button when user lacks canDeleteOrganization permission ($roleName role)",
      async ({ role }) => {
        setupUserMock({
          id: "1",
          email: "test@example.com",
          role,
          status: "active",
        });

        renderManageOrg();
        await screen.findByTestId("manage-org-screen");

        await selectOrganization({ orgIndex: 0 });

        const deleteButton = screen.queryByRole("button", {
          name: /ORG\$DELETE_ORGANIZATION/i,
        });

        expect(deleteButton).not.toBeInTheDocument();
      },
    );

    it("should open delete confirmation modal when delete button is clicked (with permission)", async () => {
      setupUserMock(TEST_USERS.OWNER);

      renderManageOrg();
      await screen.findByTestId("manage-org-screen");

      await selectOrganization({ orgIndex: 0 });

      expect(
        screen.queryByTestId("delete-org-confirmation"),
      ).not.toBeInTheDocument();

      const deleteButton = await screen.findByRole("button", {
        name: /ORG\$DELETE_ORGANIZATION/i,
      });
      await userEvent.click(deleteButton);

      expect(screen.getByTestId("delete-org-confirmation")).toBeInTheDocument();
    });
  });
});
