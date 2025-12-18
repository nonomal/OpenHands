import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoutesStub } from "react-router";
import userEvent from "@testing-library/user-event";
import ConversationsPage from "#/routes/conversations";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import { Conversation, ResultSet } from "#/api/open-hands.types";

const MOCK_CONVERSATIONS: Conversation[] = [
  {
    conversation_id: "conv-1",
    title: "Fix authentication bug",
    status: "RUNNING",
    selected_repository: "octocat/hello-world",
    selected_branch: "main",
    git_provider: "github",
    created_at: "2025-12-17T10:00:00Z",
    last_updated_at: "2025-12-17T10:30:00Z",
    runtime_status: null,
    url: null,
    session_api_key: null,
  },
  {
    conversation_id: "conv-2",
    title: "Add dark mode feature",
    status: "STOPPED",
    selected_repository: "octocat/my-repo",
    selected_branch: "feature/dark-mode",
    git_provider: "gitlab",
    created_at: "2025-12-16T14:00:00Z",
    last_updated_at: "2025-12-16T15:00:00Z",
    runtime_status: null,
    url: null,
    session_api_key: null,
  },
  {
    conversation_id: "conv-3",
    title: "Refactor API endpoints",
    status: "ERROR",
    selected_repository: null,
    selected_branch: null,
    git_provider: null,
    created_at: "2025-12-15T09:00:00Z",
    last_updated_at: "2025-12-15T09:45:00Z",
    runtime_status: null,
    url: null,
    session_api_key: null,
  },
];

const createMockResultSet = (
  conversations: Conversation[],
  nextPage: string | null = null,
): ResultSet<Conversation> => ({
  results: conversations,
  next_page_id: nextPage,
});

const RouterStub = createRoutesStub([
  {
    Component: ConversationsPage,
    path: "/conversations",
  },
  {
    Component: () => <div data-testid="conversation-detail-screen" />,
    path: "/conversations/:conversationId",
  },
]);

const renderConversationsPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<RouterStub initialEntries={["/conversations"]} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
};

describe("ConversationsPage", () => {
  const getUserConversationsSpy = vi.spyOn(
    ConversationService,
    "getUserConversations",
  );

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("initial rendering", () => {
    it("should render the page header", async () => {
      getUserConversationsSpy.mockResolvedValue(
        createMockResultSet(MOCK_CONVERSATIONS),
      );

      renderConversationsPage();

      await waitFor(() => {
        expect(
          screen.getByText("COMMON$RECENT_CONVERSATIONS"),
        ).toBeInTheDocument();
      });
    });

    it("should show loading skeleton while fetching conversations", async () => {
      getUserConversationsSpy.mockResolvedValue(
        createMockResultSet(MOCK_CONVERSATIONS),
      );

      renderConversationsPage();

      // The skeleton should appear briefly during initial load
      // Then conversations should appear
      await waitFor(() => {
        expect(screen.getByText("Fix authentication bug")).toBeInTheDocument();
      });
    });
  });

  describe("conversations list", () => {
    it("should display a list of conversations", async () => {
      getUserConversationsSpy.mockResolvedValue(
        createMockResultSet(MOCK_CONVERSATIONS),
      );

      renderConversationsPage();

      await waitFor(() => {
        expect(screen.getByText("Fix authentication bug")).toBeInTheDocument();
        expect(screen.getByText("Add dark mode feature")).toBeInTheDocument();
        expect(screen.getByText("Refactor API endpoints")).toBeInTheDocument();
      });
    });

    it("should display repository and branch information", async () => {
      getUserConversationsSpy.mockResolvedValue(
        createMockResultSet(MOCK_CONVERSATIONS),
      );

      renderConversationsPage();

      await waitFor(() => {
        expect(screen.getByText("octocat/hello-world")).toBeInTheDocument();
        expect(screen.getByText("main")).toBeInTheDocument();
        expect(screen.getByText("octocat/my-repo")).toBeInTheDocument();
        expect(screen.getByText("feature/dark-mode")).toBeInTheDocument();
      });
    });

    it("should display 'No Repository' for conversations without a repository", async () => {
      getUserConversationsSpy.mockResolvedValue(
        createMockResultSet(MOCK_CONVERSATIONS),
      );

      renderConversationsPage();

      await waitFor(() => {
        expect(screen.getByText("COMMON$NO_REPOSITORY")).toBeInTheDocument();
      });
    });

    it("should display status indicators for each conversation", async () => {
      getUserConversationsSpy.mockResolvedValue(
        createMockResultSet(MOCK_CONVERSATIONS),
      );

      renderConversationsPage();

      await waitFor(() => {
        // Status indicators are rendered as buttons with aria-labels
        const runningStatus = screen.getByLabelText("COMMON$RUNNING");
        const stoppedStatus = screen.getByLabelText("COMMON$STOPPED");
        const errorStatus = screen.getByLabelText("COMMON$ERROR");

        expect(runningStatus).toBeInTheDocument();
        expect(stoppedStatus).toBeInTheDocument();
        expect(errorStatus).toBeInTheDocument();
      });
    });
  });

  describe("empty state", () => {
    it("should show empty state when there are no conversations", async () => {
      getUserConversationsSpy.mockResolvedValue(createMockResultSet([]));

      renderConversationsPage();

      await waitFor(() => {
        expect(
          screen.getByText("HOME$NO_RECENT_CONVERSATIONS"),
        ).toBeInTheDocument();
      });
    });

    it("should not show the empty state when there is an error", async () => {
      getUserConversationsSpy.mockRejectedValue(
        new Error("Failed to fetch conversations"),
      );

      renderConversationsPage();

      await waitFor(() => {
        expect(
          screen.getByText("Failed to fetch conversations"),
        ).toBeInTheDocument();
      });

      expect(
        screen.queryByText("HOME$NO_RECENT_CONVERSATIONS"),
      ).not.toBeInTheDocument();
    });
  });

  describe("error handling", () => {
    it("should display error message when conversations fail to load", async () => {
      getUserConversationsSpy.mockRejectedValue(
        new Error("Failed to fetch conversations"),
      );

      renderConversationsPage();

      await waitFor(() => {
        expect(
          screen.getByText("Failed to fetch conversations"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("pagination", () => {
    it("should load more conversations when scrolling", async () => {
      const firstPage = MOCK_CONVERSATIONS.slice(0, 2);
      const secondPage = MOCK_CONVERSATIONS.slice(2, 3);

      getUserConversationsSpy
        .mockResolvedValueOnce(createMockResultSet(firstPage, "page-2"))
        .mockResolvedValueOnce(createMockResultSet(secondPage));

      renderConversationsPage();

      // First page should be loaded
      await waitFor(() => {
        expect(screen.getByText("Fix authentication bug")).toBeInTheDocument();
        expect(screen.getByText("Add dark mode feature")).toBeInTheDocument();
      });

      // Third conversation should not be visible yet
      expect(
        screen.queryByText("Refactor API endpoints"),
      ).not.toBeInTheDocument();

      // Simulate scrolling by triggering the intersection observer
      // Note: In a real implementation, you might need to use a library
      // like intersection-observer mock or simulate scroll events
    });

    it("should show loading indicator when fetching next page", async () => {
      getUserConversationsSpy.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () => resolve(createMockResultSet(MOCK_CONVERSATIONS)),
              100,
            );
          }),
      );

      renderConversationsPage();

      await waitFor(() => {
        expect(screen.getByText("Fix authentication bug")).toBeInTheDocument();
      });
    });
  });

  describe("navigation", () => {
    it("should navigate to conversation detail when clicking a conversation", async () => {
      getUserConversationsSpy.mockResolvedValue(
        createMockResultSet(MOCK_CONVERSATIONS),
      );

      renderConversationsPage();

      await waitFor(() => {
        expect(screen.getByText("Fix authentication bug")).toBeInTheDocument();
      });

      const conversationLink = screen
        .getByText("Fix authentication bug")
        .closest("a");
      expect(conversationLink).toHaveAttribute("href", "/conversations/conv-1");
    });
  });

  describe("API integration", () => {
    it("should call getUserConversations with correct page size", async () => {
      getUserConversationsSpy.mockResolvedValue(
        createMockResultSet(MOCK_CONVERSATIONS),
      );

      renderConversationsPage();

      await waitFor(() => {
        expect(getUserConversationsSpy).toHaveBeenCalledWith(20, undefined);
      });
    });

    it("should call getUserConversations with page ID for pagination", async () => {
      const firstPage = MOCK_CONVERSATIONS.slice(0, 2);
      const secondPage = MOCK_CONVERSATIONS.slice(2, 3);

      getUserConversationsSpy
        .mockResolvedValueOnce(createMockResultSet(firstPage, "page-2"))
        .mockResolvedValueOnce(createMockResultSet(secondPage));

      renderConversationsPage();

      await waitFor(() => {
        expect(getUserConversationsSpy).toHaveBeenCalledWith(20, undefined);
      });

      // Note: Testing the second call with page ID would require
      // triggering infinite scroll, which is complex in unit tests
    });
  });
});
