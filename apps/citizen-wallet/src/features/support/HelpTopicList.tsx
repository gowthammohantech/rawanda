/**
 * Help topics (CTZ-08 task 8): five static plain-language questions (keys, EN + RW), each with a
 * link to the screen it is about. No clinical content. Links that need a signed-in persona are
 * hidden before one is chosen.
 */
import { AppText, Button, Card, spacing, useTx, type TranslationKey } from "@laif/ui-native";
import { useRouter, type Href } from "expo-router";
import { StyleSheet, View } from "react-native";

export type HelpTopic = {
  id: "reviewed" | "latestCheck" | "stopReminders" | "demoPersona" | "correction";
  href: Href;
  /** The target screen needs a signed-in persona. */
  needsPersona: boolean;
};

export const HELP_TOPICS: readonly HelpTopic[] = [
  { id: "reviewed", href: "/health", needsPersona: true },
  { id: "latestCheck", href: "/timeline", needsPersona: true },
  { id: "stopReminders", href: "/reminders/preferences", needsPersona: true },
  { id: "demoPersona", href: "/about-demo", needsPersona: false },
  { id: "correction", href: "/more/privacy/corrections/new", needsPersona: true },
];

export function HelpTopicList({ signedIn }: { signedIn: boolean }) {
  const t = useTx();
  const router = useRouter();
  return (
    <View style={styles.list} testID="help-topics">
      {HELP_TOPICS.map((topic) => (
        <Card
          key={topic.id}
          title={t(`citizen:help.topics.${topic.id}.question` as TranslationKey)}
          testID={`help-topic-${topic.id}`}
        >
          <AppText>{t(`citizen:help.topics.${topic.id}.answer` as TranslationKey)}</AppText>
          {topic.needsPersona && !signedIn ? null : (
            <Button
              variant="secondary"
              icon="chevron"
              iconPosition="end"
              onPress={() => router.push(topic.href)}
              testID={`help-link-${topic.id}`}
            >
              {t(`citizen:help.topics.${topic.id}.link` as TranslationKey)}
            </Button>
          )}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.md } });
