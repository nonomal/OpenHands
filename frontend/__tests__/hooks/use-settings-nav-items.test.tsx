import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SAAS_NAV_ITEMS, OSS_NAV_ITEMS } from "#/constants/settings-nav";
import OptionService from "#/api/option-service/option-service.api";
import { useSettingsNavItems } from "#/hooks/use-settings-nav-items";
import * as orgStore from "#/stores/selected-organization-store";
import { OrganizationMember } from "#/types/org";
import { useActiveOrganizationMember } from "#/hooks/use-settings-nav-items";
import { organizationService } from "#/api/organization-service/organization-service.api";

const queryClient = new QueryClient();
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const mockConfig = (appMode: "saas" | "oss", hideLlmSettings = false) => {
  vi.spyOn(OptionService, "getConfig").mockResolvedValue({
    APP_MODE: appMode,
    FEATURE_FLAGS: { HIDE_LLM_SETTINGS: hideLlmSettings },
  } as Awaited<ReturnType<typeof OptionService.getConfig>>);
};

const seedActiveUser = (
  queryClient: QueryClient,
  orgId: string,
  user: Partial<OrganizationMember>,
) => {
  queryClient.setQueryData(
    ["members", orgId, "me"],
    { user_id: "u1", role: "admin", ...user } as OrganizationMember,
  );

  vi.spyOn(orgStore, "getSelectedOrganizationIdFromStore") //TODO:: correct format
    .mockReturnValue(orgId);
};

describe("useSettingsNavItems", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("should return SAAS_NAV_ITEMS when APP_MODE is 'saas' and userRole is 'member'", async () => {
    mockConfig("saas");

    const orgId = "org-1";
    seedActiveUser(queryClient, orgId, { role: "member" });

    const { result } = renderHook(() => useSettingsNavItems(), { wrapper });

    await waitFor(() => {
      expect(result.current).toEqual(
        SAAS_NAV_ITEMS.filter(
          item => item.to !== "/settings/billing"
        ),
      );
    });
  });

  it("should return SAAS_NAV_ITEMS when APP_MODE is 'saas' and userRole is NOT 'member'", async () => {
    mockConfig("saas");
    const orgId = "org-1";
    seedActiveUser(queryClient, orgId, { role: "admin" });
    const { result } = renderHook(() => useSettingsNavItems(), { wrapper });

    await waitFor(() => {
      expect(result.current).toEqual(SAAS_NAV_ITEMS);
    });
  });

  it("should return OSS_NAV_ITEMS when APP_MODE is 'oss'", async () => {
    mockConfig("oss");
    const { result } = renderHook(() => useSettingsNavItems(), { wrapper });

    await waitFor(() => {
      expect(result.current).toEqual(OSS_NAV_ITEMS);
    });
  });

  it("should filter out '/settings' item when HIDE_LLM_SETTINGS feature flag is enabled", async () => {
    mockConfig("saas", true);
    const { result } = renderHook(() => useSettingsNavItems(), { wrapper });

    await waitFor(() => {
      expect(
        result.current.find((item) => item.to === "/settings"),
      ).toBeUndefined();
    });
  });
});

describe("useActiveOrganizationMember", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("does not fetch when orgId is undefined", async () => {
    const spy = vi.spyOn(organizationService, "getMe");

    renderHook(() => useActiveOrganizationMember(undefined), { wrapper });

    // wait to allow react-query to potentially run
    await waitFor(() => {
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it("fetches user when orgId is provided", async () => {
    const orgId = "org-123";

    const mockUser: OrganizationMember = {
      user_id: "user-1",
      role: "admin",
    } as OrganizationMember;

    const spy = vi
      .spyOn(organizationService, "getMe")
      .mockResolvedValue(mockUser);

    const { result } = renderHook(
      () => useActiveOrganizationMember(orgId),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ orgId });
    expect(result.current.data).toEqual(mockUser);
  });
});
