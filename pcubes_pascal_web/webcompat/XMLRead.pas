unit XMLRead;

{$mode objfpc}{$H+}

interface

uses Classes, DOM;

procedure ReadXMLFile(out ADoc: TXmlDocument; const AFileName: String); overload;
procedure ReadXMLFile(out ADoc: TXmlDocument; AStream: TStream); overload;

implementation

procedure ReadXMLFile(out ADoc: TXmlDocument; const AFileName: String);
begin
  ADoc := nil;
end;

procedure ReadXMLFile(out ADoc: TXmlDocument; AStream: TStream);
begin
  ADoc := nil;
end;

end.
