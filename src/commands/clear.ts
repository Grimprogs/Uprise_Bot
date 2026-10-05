import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  TextChannel,
  NewsChannel,
  ThreadChannel,
  EmbedBuilder,
} from 'discord.js';

export const clearCommand = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear unnecessary messages from the channel with automated TTL.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Filter messages to delete only from a specific user')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
      return;
    }

    // Check staff permissions
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({ content: '❌ You require **Manage Messages** permission to use `/clear`.', ephemeral: true });
      return;
    }

    const channel = interaction.channel;
    if (!channel || !(channel instanceof TextChannel || channel instanceof NewsChannel || channel instanceof ThreadChannel)) {
      await interaction.reply({ content: '❌ Messages cannot be cleared in this channel type.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const amount = interaction.options.getInteger('amount', true);
    const targetUser = interaction.options.getUser('user');

    try {
      // Fetch messages up to amount (or fetch up to 100 if filtering by user)
      const fetchLimit = targetUser ? Math.min(amount * 3, 100) : amount;
      const fetched = await channel.messages.fetch({ limit: fetchLimit });

      const toDelete = targetUser
        ? fetched.filter((m) => m.author.id === targetUser.id).first(amount)
        : fetched;

      if (!toDelete || (Array.isArray(toDelete) && toDelete.length === 0)) {
        await interaction.editReply({ content: '⚠️ No eligible messages found to delete.' });
        return;
      }

      const deleted = await channel.bulkDelete(toDelete, true);

      const embed = new EmbedBuilder()
        .setTitle('🧹 Channel Cleanup Complete')
        .setColor(0x10b981)
        .setDescription(
          `Successfully deleted **${deleted.size}** message(s)${
            targetUser ? ` from <@${targetUser.id}>` : ''
          } to keep this channel clean.`
        )
        .setFooter({ text: 'This notice will auto-delete in 5 seconds (TTL)' })
        .setTimestamp(new Date());

      // Ephemeral confirmation to the moderator
      await interaction.editReply({ embeds: [embed] });

      // Post transient message in channel with 5s TTL
      const ttlNotice = await channel.send({
        content: `🧹 Cleared **${deleted.size}** message(s) by <@${interaction.user.id}>. *(Auto-deleting in 5s)*`,
      });

      setTimeout(() => {
        ttlNotice.delete().catch(() => {});
      }, 5000);
    } catch (err: any) {
      console.error('[clear command] Error:', err);
      await interaction.editReply({ content: `❌ Failed to delete messages: ${err.message}` });
    }
  },
};

export default clearCommand;
