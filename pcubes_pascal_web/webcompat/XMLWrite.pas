unit XMLWrite;

{$mode objfpc}{$H+}

interface

uses Classes, DOM;

procedure WriteXMLFile(ADoc: TXmlDocument; const AFileName: String); overload;
procedure WriteXMLFile(ADoc: TXmlDocument; AStream: TStream); overload;

implementation

procedure WriteXMLFile(ADoc: TXmlDocument; const AFileName: String);
begin
end;

procedure WriteXMLFile(ADoc: TXmlDocument; AStream: TStream);
begin
end;

end.
