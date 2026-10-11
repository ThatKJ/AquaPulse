-- Support Amazon SNS emergency broadcasts in addition to Twilio and demo transports.
alter table alerts drop constraint if exists alerts_transport_check;
alter table alerts add constraint alerts_transport_check check (transport in ('twilio', 'sns', 'demo'));
