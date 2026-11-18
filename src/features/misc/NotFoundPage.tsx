import { Compass } from "lucide-react";
import { Link } from "react-router";
import { EmptyState, Page } from "@/components/common/states";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <Page>
      <EmptyState
        icon={Compass}
        title="Nothing here"
        description="This page doesn't exist, or the item was deleted."
        action={
          <Button asChild size="sm" variant="outline">
            <Link to="/">Back to dashboard</Link>
          </Button>
        }
      />
    </Page>
  );
}

/** Shared not-found block for detail pages. */
export function ItemNotFound({ what = "item", backTo = "/", backLabel = "Back to dashboard" }: { what?: string; backTo?: string; backLabel?: string }) {
  return (
    <Page>
      <EmptyState
        icon={Compass}
        title={`This ${what} doesn't exist`}
        description="It may have been deleted, or the link is wrong."
        action={
          <Button asChild size="sm" variant="outline">
            <Link to={backTo}>{backLabel}</Link>
          </Button>
        }
      />
    </Page>
  );
}
