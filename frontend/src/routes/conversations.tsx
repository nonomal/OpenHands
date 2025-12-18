import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import CodeBranchIcon from "#/icons/u-code-branch.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { usePaginatedConversations } from "#/hooks/query/use-paginated-conversations";
import { useInfiniteScroll } from "#/hooks/use-infinite-scroll";
import { RecentConversationsSkeleton } from "#/components/features/home/recent-conversations/recent-conversations-skeleton";
import { GitProviderIcon } from "#/components/shared/git-provider-icon";
import { Provider } from "#/types/settings";
import { formatTimeDelta } from "#/utils/format-time-delta";
import { ConversationStatusIndicator } from "#/components/features/home/recent-conversations/conversation-status-indicator";
import { Conversation } from "#/api/open-hands.types";
import RepoForkedIcon from "#/icons/repo-forked.svg?react";

interface ConversationItemProps {
  conversation: Conversation;
}

function ConversationItem({ conversation }: ConversationItemProps) {
  const { t } = useTranslation();

  const hasRepository =
    conversation.selected_repository && conversation.selected_branch;

  return (
    <Link to={`/conversations/${conversation.conversation_id}`}>
      <div className="flex flex-col gap-1 p-4 cursor-pointer w-full rounded-lg hover:bg-[#5C5D62] transition-all duration-300 border border-[#525252]">
        <div className="flex items-center gap-2">
          <ConversationStatusIndicator
            conversationStatus={conversation.status}
          />
          <span className="text-sm text-white leading-6 font-medium">
            {conversation.title}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-[#A3A3A3] leading-4 font-normal">
          <div className="flex items-center gap-3">
            {hasRepository ? (
              <div className="flex items-center gap-2">
                <GitProviderIcon
                  gitProvider={conversation.git_provider as Provider}
                />
                <span
                  className="max-w-[200px] truncate"
                  title={conversation.selected_repository || ""}
                >
                  {conversation.selected_repository}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <RepoForkedIcon width={12} height={12} color="#A3A3A3" />
                <span className="max-w-[200px] truncate">
                  {t(I18nKey.COMMON$NO_REPOSITORY)}
                </span>
              </div>
            )}
            {hasRepository ? (
              <div className="flex items-center gap-1">
                <CodeBranchIcon width={12} height={12} color="#A3A3A3" />
                <span
                  className="max-w-[200px] truncate"
                  title={conversation.selected_branch || ""}
                >
                  {conversation.selected_branch}
                </span>
              </div>
            ) : null}
          </div>
          {(conversation.created_at || conversation.last_updated_at) && (
            <span>
              {formatTimeDelta(
                conversation.created_at || conversation.last_updated_at,
              )}{" "}
              {t(I18nKey.CONVERSATION$AGO)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function App() {
  const { t } = useTranslation();

  const {
    data: conversationsList,
    isFetching,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
  } = usePaginatedConversations(20);

  const scrollContainerRef = useInfiniteScroll({
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    threshold: 200,
  });

  const conversations =
    conversationsList?.pages.flatMap((page) => page.results) ?? [];

  const isInitialLoading = isFetching && !conversationsList;

  return (
    <div className="px-6 py-8 bg-transparent h-full flex flex-col overflow-y-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          {t(I18nKey.COMMON$RECENT_CONVERSATIONS)}
        </h1>
      </header>

      {error && (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-danger">{error.message}</p>
        </div>
      )}

      {isInitialLoading && (
        <div className="max-w-4xl">
          <RecentConversationsSkeleton />
        </div>
      )}

      {!isInitialLoading && !error && conversations.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-sm text-[#A3A3A3]">
            {t(I18nKey.HOME$NO_RECENT_CONVERSATIONS)}
          </p>
        </div>
      )}

      {!isInitialLoading && conversations.length > 0 && (
        <div ref={scrollContainerRef} className="flex flex-col gap-2 max-w-4xl">
          {conversations.map((conversation) => (
            <ConversationItem
              key={conversation.conversation_id}
              conversation={conversation}
            />
          ))}
          {isFetchingNextPage && (
            <div className="py-4 text-center text-sm text-[#A3A3A3]">
              {t(I18nKey.HOME$LOADING)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
